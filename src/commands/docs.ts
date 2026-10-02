import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command, Option } from "commander";
import reference from "../../docs/cli.md" with { type: "text" };
import pkg from "../../package.json";
import { appPaths } from "../core/paths.ts";

export function registerDocs(program: Command) {
  program
    .command("docs")
    .summary("full reference (markdown) or man page")
    .description(
      "Print the complete command reference as markdown — the best single starting point for agents — or the man page.",
    )
    .option("--man", "print the man page (roff)")
    .option("--install-man", "install the man page into the user's man directory")
    .action((opts: { man?: boolean; installMan?: boolean }) => {
      if (opts.installMan) {
        const dir = join(process.platform === "win32" ? appPaths().data : manBase(), "man1");
        mkdirSync(dir, { recursive: true });
        const path = join(dir, "yt-data.1");
        writeFileSync(path, manPage(program));
        process.stdout.write(`${JSON.stringify({ path })}\n`);
        return;
      }
      process.stdout.write(opts.man ? manPage(program) : reference);
    });
}

function manBase(): string {
  const home = process.env.HOME ?? "";
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "man");
}

/** roff-escape text: backslashes, leading dots/quotes, and dashes in option names. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\e")
    .replace(/-/g, "\\-")
    .replace(/^([.'])/gm, "\\&$1");
}

function optionLines(options: readonly Option[]): string[] {
  const out: string[] = [];
  for (const o of options) {
    if (o.hidden) continue;
    // Negatable flags (--no-cache) carry an implicit `true` default that means nothing to readers.
    const def =
      o.defaultValue !== undefined && typeof o.defaultValue !== "boolean"
        ? ` (default: ${String(o.defaultValue)})`
        : "";
    const choices = o.argChoices ? ` One of: ${o.argChoices.join(", ")}.` : "";
    out.push(
      ".TP",
      `.B ${esc(o.flags)}`,
      esc(`${o.description}${def}.${choices}`.replace(/\.\./g, ".")),
    );
  }
  return out;
}

/** Man page generated from the live command definitions, so it can't drift from the code. */
export function manPage(program: Command): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `.TH YT\\-DATA 1 "${date}" "yt-data ${pkg.version}" "User Commands"`,
    ".SH NAME",
    "yt\\-data \\- fetch YouTube channel, video, transcript and media data",
    ".SH SYNOPSIS",
    ".B yt\\-data",
    ".I command",
    "[\\fIoptions\\fR] [\\fIrefs\\fR...]",
    ".SH DESCRIPTION",
    esc(program.description()),
    ".PP",
    esc(
      "A ref is a youtube.com or youtu.be URL, an @handle, a UC… channel id, an 11-character video id or a PL… playlist id. Use - to read refs from stdin, one per line.",
    ),
    ".PP",
    esc(
      "Output is JSON by default (pretty on a terminal, compact otherwise). One ref prints an object; several print an array. --format ndjson prints one object per line. Run `yt-data docs` for the full reference with field lists and examples, and `yt-data schema <name>` for JSON Schemas.",
    ),
    ".SH GLOBAL OPTIONS",
    ...optionLines(program.options),
    ".SH COMMANDS",
  ];
  for (const cmd of program.commands) {
    const args = cmd.registeredArguments.map((a) =>
      a.required
        ? `<${a.name()}${a.variadic ? "..." : ""}>`
        : `[${a.name()}${a.variadic ? "..." : ""}]`,
    );
    lines.push(".SS", `.B ${esc([cmd.name(), ...args].join(" "))}`, esc(cmd.description()));
    lines.push(...optionLines(cmd.options));
  }
  lines.push(
    ".SH EXIT STATUS",
    ".TP",
    ".B 0",
    "Success.",
    ...[
      ["1", "Internal error."],
      ["2", "Invalid usage or unparseable ref."],
      ["3", "Not found (video, channel, playlist, captions)."],
      ["4", "Rate limited or bot check; retry later or use cookies / a proxy."],
      ["5", "Unavailable: private, age-restricted, members-only or region-blocked."],
      ["6", "Missing dependency (yt-dlp or ffmpeg)."],
      ["7", "Network error."],
    ].flatMap(([code, text]) => [".TP", `.B ${code}`, esc(text as string)]),
    ".PP",
    esc('Every failure also writes one JSON line to stderr: {"error":{"code","message","hint"}}.'),
    ".SH ENVIRONMENT",
    ...[
      ["YT_DATA_CONFIG", "Config file path."],
      ["YT_DATA_CACHE_DIR", "Cache directory."],
      ["YT_DATA_NO_CACHE", "1 disables caching."],
      ["YT_DATA_NO_UPDATE_CHECK", "1 disables the daily update notice."],
      ["YT_DATA_YTDLP", "yt-dlp executable to use."],
      ["YT_DATA_COOKIES", "Netscape cookies.txt file."],
      ["YT_DATA_COOKIES_FROM_BROWSER", "Browser to read cookies from (yt-dlp)."],
      ["YT_DATA_PROXY", "HTTP or SOCKS proxy URL."],
      ["YT_DATA_LOG", "silent, error, warn, info or debug."],
    ].flatMap(([name, text]) => [".TP", `.B ${esc(name as string)}`, esc(text as string)]),
    ".SH FILES",
    ".TP",
    ".I ~/.config/yt\\-data/config.json",
    "Configuration (flags override environment, which overrides this file).",
    ".TP",
    ".I ~/.cache/yt\\-data/",
    "Cached sessions and results.",
    ".TP",
    ".I ~/.local/share/yt\\-data/bin/yt\\-dlp",
    "Managed yt\\-dlp installed by \\fByt\\-data update \\-\\-yt\\-dlp\\fR.",
    ".SH EXAMPLES",
    ".nf",
    ...[
      "yt-data channel @mkbhd --fields name,subscriberCount",
      "yt-data videos @mkbhd --limit 20 --format table --fields title,viewCount,publishedText",
      "yt-data video dQw4w9WgXcQ",
      "yt-data transcript dQw4w9WgXcQ --as txt",
      "yt-data thumbnail dQw4w9WgXcQ -o ./thumbs",
      "yt-data download dQw4w9WgXcQ --quality 1080p -o ./downloads",
      "yt-data update",
    ].map(esc),
    ".fi",
    ".SH SEE ALSO",
    "yt\\-dlp(1), ffmpeg(1)",
    "",
  );
  return lines.join("\n");
}
