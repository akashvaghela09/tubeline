// Downloading through yt-dlp, shared by `yt-data download` and the interactive UI.
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "../core/errors.ts";
import { videoUrl } from "../core/resolve.ts";
import {
  commonArgs,
  findFfmpeg,
  requireYtDlp,
  runYtDlpStreaming,
  type YtDlpOptions,
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
export const DEFAULT_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

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

export interface DownloadRequest {
  quality: Quality;
  audioFormat: AudioFormat;
  output: string;
  template?: string;
  /** Subtitle languages to write alongside (comma-separated), if any. */
  subs?: string;
  thumbnail?: boolean;
  extraArgs?: string[];
}

export interface DownloadResult {
  id: string;
  title: string;
  path: string;
  ext: string;
  formatId: string;
  resolution: string;
  sizeBytes: number | null;
}

export interface Progress {
  /** 0–100 when yt-dlp reports it. */
  percent: number | null;
  line: string;
}

/** Plan a batch once (dependency checks, warnings) and get a function that downloads one id. */
export function prepareDownload(req: DownloadRequest, ytdlpOpts: YtDlpOptions) {
  const ytdlp = requireYtDlp();
  const plan = formatArgs(req.quality, req.audioFormat, findFfmpeg() !== null);
  mkdirSync(req.output, { recursive: true });

  const extra: string[] = [];
  if (req.subs)
    extra.push(
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      req.subs,
      "--convert-subs",
      "srt",
    );
  if (req.thumbnail) extra.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  extra.push(...(req.extraArgs ?? []));

  const download = async (
    id: string,
    onProgress?: (p: Progress) => void,
  ): Promise<DownloadResult> => {
    const args = [
      ...commonArgs(ytdlpOpts),
      ...plan.args,
      "-o",
      join(req.output, req.template ?? DEFAULT_TEMPLATE),
      "--print",
      `after_move:${RESULT_TAG}%(.{id,title,filepath,ext,format_id,resolution})j`,
      "--progress",
      "--newline",
      ...extra,
      videoUrl(id),
    ];
    let result: Record<string, unknown> | undefined;
    const res = await runYtDlpStreaming(ytdlp.path, args, (line) => {
      if (line.startsWith(RESULT_TAG)) result = JSON.parse(line.slice(RESULT_TAG.length));
      else onProgress?.({ percent: parsePercent(line), line });
    });
    if (res.code !== 0) throw ytDlpError(res.stderr);
    if (!result) {
      throw new CliError(
        "INTERNAL",
        "yt-dlp finished without reporting a file",
        res.stderr.trim() || undefined,
      );
    }
    const path = String(result.filepath);
    return {
      id: String(result.id),
      title: String(result.title),
      path,
      ext: String(result.ext),
      formatId: String(result.format_id),
      resolution: String(result.resolution),
      sizeBytes: fileSize(path),
    };
  };
  return { download, warning: plan.warning };
}

/** "[download]  42.0% of 10.00MiB at …" → 42. */
export function parsePercent(line: string): number | null {
  const m = line.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/);
  return m ? Number(m[1]) : null;
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}
