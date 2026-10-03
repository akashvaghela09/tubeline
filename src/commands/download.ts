import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { downloadHuman } from "../core/human.ts";
import { log } from "../core/log.ts";
import { parseRef, refKindLabel } from "../core/resolve.ts";
import { runForRefs } from "../core/run.ts";
import {
  AUDIO_FORMATS,
  type AudioFormat,
  DEFAULT_TEMPLATE,
  prepareDownload,
  QUALITIES,
  type Quality,
  splitArgs,
} from "../services/download.ts";
import { progressLine } from "../ui/format.ts";

interface DownloadOptions {
  quality: Quality;
  audioFormat: AudioFormat;
  output: string;
  template: string;
  withSubs?: string | boolean;
  withThumbnail?: boolean;
  ytDlpArgs?: string;
  fields?: string;
}

export function registerDownload(program: Command, getCtx: () => AppContext) {
  program
    .command("download")
    .summary("download videos or audio (via yt-dlp)")
    .description(
      "Download videos or audio with yt-dlp. Prints one JSON record per finished file; progress goes to stderr when it is a terminal.",
    )
    .argument("<refs...>", "video URL or id, or - to read refs from stdin")
    .addOption(
      new Option("--quality <q>", "maximum video height, or audio only")
        .choices(QUALITIES)
        .default("best"),
    )
    .addOption(
      new Option("--audio-format <f>", "audio format for --quality audio")
        .choices(AUDIO_FORMATS)
        .default("m4a"),
    )
    .option("-o, --output <dir>", "output directory", ".")
    .option("--template <tpl>", "yt-dlp output filename template", DEFAULT_TEMPLATE)
    .option("--with-subs [langs]", "also write subtitles (comma-separated languages, default en)")
    .option("--with-thumbnail", "also write the thumbnail as .jpg")
    .option("--yt-dlp-args <args>", "extra arguments passed to yt-dlp verbatim")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data download dQw4w9WgXcQ
  yt-data download dQw4w9WgXcQ --quality 1080p -o ./downloads
  yt-data download dQw4w9WgXcQ --quality audio --audio-format mp3
  yt-data download dQw4w9WgXcQ --with-subs en,de --with-thumbnail
  yt-data download dQw4w9WgXcQ --yt-dlp-args "--limit-rate 2M"

Output: {id, title, path, ext, formatId, resolution, sizeBytes}
Requires yt-dlp (system, or managed via \`yt-data update --yt-dlp\`); ffmpeg for >360p and
audio conversion.`,
    )
    .action(async (refs: string[], opts: DownloadOptions) => {
      const ctx = getCtx();
      const { download, warning } = prepareDownload(
        {
          quality: opts.quality,
          audioFormat: opts.audioFormat,
          output: opts.output,
          template: opts.template,
          subs: opts.withSubs === true ? "en" : opts.withSubs || undefined,
          thumbnail: opts.withThumbnail,
          extraArgs: opts.ytDlpArgs ? splitArgs(opts.ytDlpArgs) : [],
        },
        ctx.ytdlp,
      );
      if (warning) log.warn(warning);
      const showProgress =
        process.stderr.isTTY && ctx.config.logLevel !== "error" && ctx.config.logLevel !== "silent";

      await runForRefs(
        ctx,
        refs,
        { fields: opts.fields, concurrency: 1, human: downloadHuman },
        async (ref) => {
          const parsed = parseRef(ref);
          if (parsed.kind !== "video")
            throw new CliError("USAGE", `"${ref}" is a ${refKindLabel(parsed)}, not a video`);
          const cols = process.stderr.columns || 80;
          const kind = opts.quality === "audio" ? "audio" : "video";
          const result = await download(
            parsed.id,
            showProgress
              ? (p) => process.stderr.write(`\r\x1b[K${progressLine(p, kind, parsed.id, cols - 1)}`)
              : undefined,
          );
          if (showProgress) process.stderr.write("\r\x1b[K");
          return result;
        },
      );
    });
}
