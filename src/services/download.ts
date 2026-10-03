// Downloading through yt-dlp, shared by `yt-data download` and the interactive UI.
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
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
  /** The file was already in the output folder; yt-dlp skipped the download. */
  alreadyDownloaded?: boolean;
}

export type Stage = "preparing" | "downloading" | "merging" | "converting" | "done";

export interface Progress {
  stage: Stage;
  /** 1-based stream being downloaded, of `streams` (video + audio = 2). */
  stream: number;
  streams: number;
  /** Overall 0–100 across streams and post-processing; never goes backwards. */
  percent: number;
  /** Current stream, 0–100. */
  streamPercent: number | null;
  totalBytes: number | null;
  downloadedBytes: number | null;
  /** Bytes per second. */
  speed: number | null;
  /** Seconds remaining for the current stream. */
  eta: number | null;
  line: string;
}

/** Machine-readable lines we ask yt-dlp to print (it prints nothing else in quiet mode). */
const FMT_TAG = "YTDATA_FMT ";
const PROG_TAG = "YTDATA_PROG ";
const POST_TAG = "YTDATA_POST ";

export const PROGRESS_ARGS = [
  "--print",
  `before_dl:${FMT_TAG}%(format_id)s`,
  "--progress",
  "--newline",
  "--progress-template",
  `download:${PROG_TAG}%(info.format_id)s|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
  "--progress-template",
  `postprocess:${POST_TAG}%(progress.postprocessor)s|%(progress.status)s`,
];

const num = (v: string | undefined): number | null => {
  const n = Number(v);
  return v && v !== "NA" && Number.isFinite(n) ? n : null;
};

/**
 * Turns yt-dlp's progress lines into one monotonic overall progress. Streams share the
 * download phase by weight (video is much larger than audio); merging or audio conversion
 * takes the last few percent.
 */
export class ProgressTracker {
  private state: Progress = {
    stage: "preparing",
    stream: 0,
    streams: 1,
    percent: 0,
    streamPercent: null,
    totalBytes: null,
    downloadedBytes: null,
    speed: null,
    eta: null,
    line: "",
  };
  private formats: string[] = [];
  private sawDownload = false;

  constructor(private readonly postProcess: boolean) {}

  /** No bytes were transferred: the file was already there. */
  get alreadyDownloaded(): boolean {
    return !this.sawDownload;
  }

  update(line: string): Progress {
    const s = this.state;
    s.line = line;
    if (line.startsWith(FMT_TAG)) {
      this.formats = line.slice(FMT_TAG.length).trim().split("+");
      s.streams = Math.max(1, this.formats.length);
    } else if (line.startsWith(PROG_TAG)) {
      const [fmt, status, done, total, estimate, speed, eta] = line
        .slice(PROG_TAG.length)
        .split("|");
      const index = this.formats.indexOf(fmt ?? "");
      s.stream = index >= 0 ? index + 1 : Math.max(1, s.stream);
      s.stage = "downloading";
      if (status === "downloading") this.sawDownload = true;
      s.totalBytes = num(total) ?? num(estimate);
      s.downloadedBytes = num(done);
      s.streamPercent =
        status === "finished"
          ? 100
          : s.totalBytes && s.downloadedBytes !== null
            ? (s.downloadedBytes / s.totalBytes) * 100
            : null;
      s.speed = num(speed);
      s.eta = num(eta);
    } else if (line.startsWith(POST_TAG)) {
      const [pp, status] = line.slice(POST_TAG.length).split("|");
      if (status === "started") {
        if (pp === "Merger") s.stage = "merging";
        else if (pp === "ExtractAudio" || pp === "VideoConvertor") s.stage = "converting";
      }
    }
    s.percent = Math.max(s.percent, this.overall());
    return { ...s };
  }

  finish(): Progress {
    this.state.stage = "done";
    this.state.percent = 100;
    return { ...this.state };
  }

  private overall(): number {
    const s = this.state;
    if (s.stage === "done") return 100;
    const share = this.postProcess || s.streams > 1 ? 95 : 100;
    if (s.stage === "merging" || s.stage === "converting") return share;
    if (s.stage === "preparing" || s.stream === 0) return 0;
    const weights =
      s.streams === 1 ? [1] : [0.85, ...Array(s.streams - 1).fill(0.15 / (s.streams - 1))];
    const before = weights.slice(0, s.stream - 1).reduce((a, b) => a + b, 0);
    const current = (weights[s.stream - 1] ?? 0) * ((s.streamPercent ?? 0) / 100);
    return Math.min(share, (before + current) * share);
  }
}

/** Plan a batch once (dependency checks, warnings) and get a function that downloads one id. */
export function prepareDownload(req: DownloadRequest, ytdlpOpts: YtDlpOptions) {
  const ytdlp = requireYtDlp();
  const hasFfmpeg = findFfmpeg() !== null;
  const plan = formatArgs(req.quality, req.audioFormat, hasFfmpeg);
  mkdirSync(req.output, { recursive: true });

  const extra: string[] = [];
  if (req.subs) {
    extra.push(
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      req.subs,
      "--convert-subs",
      "srt",
    );
  }
  if (req.thumbnail) extra.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  extra.push(...(req.extraArgs ?? []));

  const download = async (
    id: string,
    onProgress?: (p: Progress) => void,
    signal?: AbortSignal,
  ): Promise<DownloadResult> => {
    const tracker = new ProgressTracker(req.quality === "audio" && hasFfmpeg);
    const args = [
      ...commonArgs(ytdlpOpts),
      ...plan.args,
      "-o",
      join(req.output, req.template ?? DEFAULT_TEMPLATE),
      "--print",
      `after_move:${RESULT_TAG}%(.{id,title,filepath,ext,format_id,resolution})j`,
      ...PROGRESS_ARGS,
      ...extra,
      videoUrl(id),
    ];
    let result: Record<string, unknown> | undefined;
    const res = await runYtDlpStreaming(
      ytdlp.path,
      args,
      (line) => {
        if (line.startsWith(RESULT_TAG)) result = JSON.parse(line.slice(RESULT_TAG.length));
        else onProgress?.(tracker.update(line));
      },
      signal,
    );
    if (signal?.aborted) {
      removePartials(req.output, id);
      throw new CliError("USAGE", "Download cancelled");
    }
    if (res.code !== 0) throw ytDlpError(res.stderr);
    if (!result) {
      throw new CliError(
        "INTERNAL",
        "yt-dlp finished without reporting a file",
        res.stderr.trim() || undefined,
      );
    }
    onProgress?.(tracker.finish());
    const path = String(result.filepath);
    return {
      id: String(result.id),
      title: String(result.title),
      path,
      ext: String(result.ext),
      formatId: String(result.format_id),
      resolution: String(result.resolution),
      sizeBytes: fileSize(path),
      alreadyDownloaded: tracker.alreadyDownloaded,
    };
  };
  return { download, warning: plan.warning };
}

/** Remove yt-dlp leftovers (.part, .ytdl, unmerged .fNNN.ext) belonging to `id`. */
export function removePartials(dir: string, id: string): number {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.includes(id)) continue;
      if (/\.(part|ytdl)$|\.part-Frag\d+$|\.f\d+\.\w+$/.test(name)) {
        rmSync(join(dir, name), { force: true });
        removed++;
      }
    }
  } catch {}
  return removed;
}

function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}
