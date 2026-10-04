#!/usr/bin/env bun
import { Command, CommanderError, Option } from "commander";
import pkg from "../package.json";
import { registerChannel } from "./commands/channel.ts";
import { registerDocs } from "./commands/docs.ts";
import { registerDoctor } from "./commands/doctor.ts";
import { registerDownload } from "./commands/download.ts";
import { registerSchema } from "./commands/schema.ts";
import { registerSearch } from "./commands/search.ts";
import { registerThumbnail } from "./commands/thumbnail.ts";
import { registerTranscript } from "./commands/transcript.ts";
import { registerUi } from "./commands/ui.ts";
import { registerUpdate } from "./commands/update.ts";
import { registerVideo } from "./commands/video.ts";
import { registerVideos } from "./commands/videos.ts";
import { FORMATS, type GlobalFlags } from "./core/config.ts";
import { AppContext } from "./core/context.ts";
import { CliError, formatError, setHumanErrors, toCliError } from "./core/errors.ts";
import { shouldCheck, updateNotice } from "./update/check.ts";
import { cleanupOld } from "./update/install.ts";

const program = new Command("tubeline")
  .description(
    "Fetch YouTube channel and video data as JSON. Data goes to stdout, logs and errors to stderr; never prompts.",
  )
  .version(pkg.version, "-V, --version")
  .option("--json", "JSON output (the default when stdout isn't a terminal)")
  .addOption(
    new Option(
      "-f, --format <fmt>",
      "output format (default: human at a terminal, json otherwise)",
    ).choices(FORMATS),
  )
  .option("--region <code>", "content region, 2-letter country code (default: US)")
  .option("--cookies <file>", "Netscape cookies.txt for age-restricted / members-only content")
  .option(
    "--cookies-from-browser <name>",
    "browser to read cookies from for yt-dlp (chrome, firefox, …)",
  )
  .option("--proxy <url>", "HTTP or SOCKS proxy URL")
  .option("--no-cache", "don't read or write cached data")
  .option("--refresh", "ignore cached results but store fresh ones")
  .option("-q, --quiet", "only print errors to stderr")
  .option("-v, --verbose", "debug logging to stderr")
  .addHelpText(
    "after",
    `
Errors: non-zero exit and one JSON line on stderr: {"error":{"code","message","hint"}}
Exit codes: 0 ok, 1 internal, 2 usage, 3 not found, 4 rate limited, 5 unavailable,
            6 missing dependency, 7 network
Config: ~/.config/tubeline/config.json (or $TUBELINE_CONFIG). Flags > env > config > defaults.`,
  )
  .showSuggestionAfterError()
  .exitOverride()
  .configureOutput({ outputError: () => {} });

let ctx: AppContext | undefined;
const getCtx = () => {
  ctx ??= new AppContext(program.opts<GlobalFlags>());
  return ctx;
};

registerChannel(program, getCtx);
registerVideo(program, getCtx);
registerVideos(program, getCtx);
registerSearch(program, getCtx);
registerTranscript(program, getCtx);
registerThumbnail(program, getCtx);
registerDownload(program, getCtx);
registerDoctor(program, getCtx);
registerUpdate(program, getCtx);
registerSchema(program);
registerUi(program, getCtx);
registerDocs(program);

// `tubeline videos … | head` closes stdout early; that's a normal way to stop, not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

cleanupOld(process.execPath);
// Until the config is loaded (e.g. argument errors), guess from the terminal and flags.
setHumanErrors(
  !!process.stdout.isTTY &&
    !!process.stderr.isTTY &&
    !process.argv.some((a) => a === "--json" || a.startsWith("--format") || a === "-f"),
);

// Plain `tubeline` at a terminal opens the menus; anywhere else it prints help as before.
const bare = process.argv.length <= 2;
const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;

try {
  await program.parseAsync(bare && interactive ? [...process.argv, "ui"] : process.argv);
  await maybeNotifyUpdate();
} catch (err) {
  if (err instanceof CommanderError) {
    // --help / --version exit through here with code 0.
    if (err.exitCode === 0) process.exit(0);
    fail(new CliError("USAGE", err.message.replace(/^error:\s*/, ""), "Run `tubeline --help`"));
  }
  fail(toCliError(err));
}

async function maybeNotifyUpdate() {
  if (!process.stderr.isTTY) return;
  let app: AppContext;
  try {
    app = getCtx(); // commands like `schema` never needed one
  } catch {
    return;
  }
  if (!shouldCheck(app.config, true, program.args[0])) return;
  const notice = await updateNotice(app.config, app.fetch);
  if (notice) process.stderr.write(`${notice}\n`);
}

function fail(error: CliError): never {
  process.stderr.write(formatError(error));
  process.exit(error.exitCode);
}
