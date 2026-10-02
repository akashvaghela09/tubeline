import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { log } from "../core/log.ts";
import { parseRef, refKindLabel, videoUrl } from "../core/resolve.ts";
import { runForRefs } from "../core/run.ts";
import {
  commonArgs,
  findFfmpeg,
  requireYtDlp,
  runYtDlpStreaming,
  ytDlpError,
} from "../sources/ytdlp.ts";

export const QUALITIES = [
  "best",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
  "audio",
] as const;
export type Quality = (typeof QUALITIES)[number];
export const AUDIO_FORMATS = ["m4a", "mp3", "opus"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

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

/** Marks our result line among yt-dlp's stdout (progress shares the stream). */
const RESULT_TAG = "YTDATA_RESULT ";

export interface FormatPlan {
  args: string[];
  /** Set when quality had to be reduced because ffmpeg is missing. */
  warning?: string;
}

/** yt-dlp format arguments for a quality, given whether ffmpeg is available. */
export function formatArgs(
  quality: Quality,
  audioFormat: AudioFormat,
  hasFfmpeg: boolean,
): FormatPlan {
  if (quality === "audio") {
    if (!hasFfmpeg) {
      if (audioFormat !== "m4a") {
        throw new CliError(
          "MISSING_DEPENDENCY",
          `Converting audio to ${audioFormat} needs ffmpeg`,
          "Install ffmpeg, or use --audio-format m4a",
        );
      }
      return { args: ["-f", "ba[ext=m4a]/ba"] };
    }
    return { args: ["-f", "ba/b", "-x", "--audio-format", audioFormat] };
  }
  const height = quality === "best" ? null : Number.parseInt(quality, 10);
  const cap = height ? `[height<=${height}]` : "";
  if (!hasFfmpeg) {
    // Without ffmpeg only pre-merged (progressive) formats work; YouTube serves those at ≤360p.
    return {
      args: ["-f", `b${cap}/b`],
      warning:
        "ffmpeg not found: downloading a single pre-merged file (usually ≤360p). Install ffmpeg for higher quality",
    };
  }
  // Prefer mp4/m4a at equal resolution; fall back to mkv when codecs don't fit mp4.
  return { args: ["-f", `bv*${cap}+ba/b${cap}`, "-S", "ext", "--merge-output-format", "mp4/mkv"] };
}

/** Split a --yt-dlp-args string, honouring simple quotes. */
export function splitArgs(value: string): string[] {
  return [...value.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
    (m) => (m[1] ?? m[2] ?? m[3]) as string,
  );
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
    .option("--template <tpl>", "yt-dlp output filename template", "%(title)s [%(id)s].%(ext)s")
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
      const ytdlp = requireYtDlp();
      const plan = formatArgs(opts.quality, opts.audioFormat, findFfmpeg() !== null);
      if (plan.warning) log.warn(plan.warning);
      mkdirSync(opts.output, { recursive: true });
      const showProgress =
        process.stderr.isTTY && ctx.config.logLevel !== "error" && ctx.config.logLevel !== "silent";

      const extra: string[] = [];
      if (opts.withSubs) {
        const langs = opts.withSubs === true ? "en" : opts.withSubs;
        extra.push(
          "--write-subs",
          "--write-auto-subs",
          "--sub-langs",
          langs,
          "--convert-subs",
          "srt",
        );
      }
      if (opts.withThumbnail) extra.push("--write-thumbnail", "--convert-thumbnails", "jpg");
      if (opts.ytDlpArgs) extra.push(...splitArgs(opts.ytDlpArgs));

      await runForRefs(ctx, refs, { fields: opts.fields, concurrency: 1 }, async (ref) => {
        const parsed = parseRef(ref);
        if (parsed.kind !== "video")
          throw new CliError("USAGE", `"${ref}" is a ${refKindLabel(parsed)}, not a video`);
        const args = [
          ...commonArgs(ctx.ytdlp),
          ...plan.args,
          "-o",
          join(opts.output, opts.template),
          "--print",
          `after_move:${RESULT_TAG}%(.{id,title,filepath,ext,format_id,resolution})j`,
          "--progress",
          "--newline",
          ...extra,
          videoUrl(parsed.id),
        ];
        let result: Record<string, unknown> | undefined;
        const res = await runYtDlpStreaming(ytdlp.path, args, (line) => {
          if (line.startsWith(RESULT_TAG)) result = JSON.parse(line.slice(RESULT_TAG.length));
          else if (showProgress) process.stderr.write(`${line}\n`);
        });
        if (res.code !== 0) throw ytDlpError(res.stderr);
        if (!result)
          throw new CliError(
            "INTERNAL",
            "yt-dlp finished without reporting a file",
            res.stderr.trim() || undefined,
          );
        const path = String(result.filepath);
        return {
          id: result.id,
          title: result.title,
          path,
          ext: result.ext,
          formatId: result.format_id,
          resolution: result.resolution,
          sizeBytes: fileSize(path),
        };
      });
    });
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}
