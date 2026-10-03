import type { Command } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";

export function registerUi(program: Command, getCtx: () => AppContext) {
  program
    .command("ui")
    .summary("interactive menus (also: plain `yt-data` at a terminal)")
    .description(
      "Interactive menus for people: paste a link or search, then download videos or audio, save transcripts or thumbnails, browse channels and playlists, update or check setup. Needs a terminal; for scripts and agents use the regular commands.",
    )
    .action(async () => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new CliError(
          "USAGE",
          "`yt-data ui` needs an interactive terminal",
          "Use the regular commands (see `yt-data --help`)",
        );
      }
      // Some pseudo-terminals report 0 columns, which makes every prompt wrap per character.
      if (!process.stdout.columns) Object.defineProperty(process.stdout, "columns", { value: 80 });
      // Loaded on demand so scripted runs never pay for the UI code.
      const { runUi } = await import("../ui/index.ts");
      await runUi(getCtx());
    });
}
