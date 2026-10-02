#!/usr/bin/env bun
import { Command, CommanderError, Option } from "commander";
import pkg from "../package.json";
import { registerChannel } from "./commands/channel.ts";
import { registerDocs } from "./commands/docs.ts";
import { registerDoctor } from "./commands/doctor.ts";
import { registerDownload } from "./commands/download.ts";
import { registerSchema } from "./commands/schema.ts";
import { registerThumbnail } from "./commands/thumbnail.ts";
import { registerTranscript } from "./commands/transcript.ts";
import { registerUpdate } from "./commands/update.ts";
import { registerVideo } from "./commands/video.ts";
import { registerVideos } from "./commands/videos.ts";
import { FORMATS, type GlobalFlags } from "./core/config.ts";
import { AppContext } from "./core/context.ts";
import { CliError, toCliError } from "./core/errors.ts";
import { shouldCheck, updateNotice } from "./update/check.ts";
import { cleanupOld } from "./update/install.ts";

const program = new Command("yt-data")
  .description(
    "Fetch YouTube channel and video data as JSON. Data goes to stdout, logs and errors to stderr; never prompts.",
  )
  .version(pkg.version, "-V, --version")
  .addOption(new Option("-f, --format <fmt>", "output format (default: json)").choices(FORMATS))
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
Config: ~/.config/yt-data/config.json (or $YT_DATA_CONFIG). Flags > env > config > defaults.`,
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
registerTranscript(program, getCtx);
registerThumbnail(program, getCtx);
registerDownload(program, getCtx);
registerDoctor(program, getCtx);
registerUpdate(program, getCtx);
registerSchema(program);
registerDocs(program);

// `yt-data videos … | head` closes stdout early; that's a normal way to stop, not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

cleanupOld(process.execPath);

try {
  await program.parseAsync();
  await maybeNotifyUpdate();
} catch (err) {
  if (err instanceof CommanderError) {
    // --help / --version exit through here with code 0.
    if (err.exitCode === 0) process.exit(0);
    fail(new CliError("USAGE", err.message.replace(/^error:\s*/, ""), "Run `yt-data --help`"));
  }
  fail(toCliError(err));
}

async function maybeNotifyUpdate() {
  if (!ctx || !shouldCheck(ctx.config, !!process.stderr.isTTY, program.args[0])) return;
  const notice = await updateNotice(ctx.config, ctx.fetch);
  if (notice) process.stderr.write(`${notice}\n`);
}

function fail(error: CliError): never {
  process.stderr.write(`${JSON.stringify(error.toJSON())}\n`);
  process.exit(error.exitCode);
}
