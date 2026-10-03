// Actions shared by the video and browse screens: queueing downloads, transcripts and
// thumbnails, and the small dialogs they need.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { bytes } from "../core/style.ts";
import type { Video } from "../models/video.ts";
import type { Quality } from "../services/download.ts";
import type { Ui } from "./app.tsx";
import { tildify } from "./format.ts";
import { expandHome, type Prefs, type TranscriptChoice } from "./prefs.ts";

export interface Target {
  id: string;
  title: string;
}

const QUALITY_ORDER: Prefs["videoQuality"][] = [
  "best",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
];

/** Ask for a folder (prefilled), create it if needed, then continue. */
export function askFolder(ui: Ui, title: string, initial: string, then: (dir: string) => void) {
  ui.push({
    kind: "prompt",
    title,
    initial: tildify(initial),
    hint: "Enter to confirm. A folder that doesn't exist yet will be created.",
    onSubmit(value) {
      const dir = expandHome(value.trim() || initial);
      try {
        if (existsSync(dir) && !statSync(dir).isDirectory())
          return `${dir} is a file, not a folder`;
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        return `Can't use ${dir}: ${(err as Error).message}`;
      }
      then(dir);
      return undefined;
    },
  });
}

export function queueVideos(
  ui: Ui,
  targets: Target[],
  kind: "video" | "audio",
  opts?: { quality?: Quality; dir?: string },
) {
  const dir = opts?.dir ?? ui.prefs.downloadDir;
  const spec = {
    kind,
    quality: opts?.quality ?? ui.prefs.videoQuality,
    audioFormat: ui.prefs.audioFormat,
    dir,
  };
  for (const t of targets) ui.jobs.add(t.id, t.title, { kind, spec });
  const what =
    kind === "audio"
      ? ui.prefs.audioFormat
      : spec.quality === "best"
        ? "best quality"
        : spec.quality;
  ui.toast(
    `Queued ${targets.length === 1 ? `“${targets[0]?.title}”` : `${targets.length} videos`} · ${what} → ${tildify(dir)}`,
    "ok",
  );
}

export function queueTranscripts(
  ui: Ui,
  targets: Target[],
  format?: TranscriptChoice,
  dir?: string,
) {
  const fmt = format ?? ui.prefs.transcriptFormat;
  const out = dir ?? ui.prefs.transcriptDir;
  for (const t of targets) {
    ui.jobs.add(t.id, t.title, {
      kind: "transcript",
      run: async () =>
        ui.services.saveTranscript(await ui.services.getTranscript(t.id), t.title, fmt, out),
    });
  }
  ui.toast(
    `Saving ${targets.length === 1 ? "transcript" : `${targets.length} transcripts`} (${fmt}) → ${tildify(out)}`,
    "ok",
  );
}

export function queueThumbnails(ui: Ui, targets: Target[]) {
  const out = ui.prefs.thumbnailDir;
  for (const t of targets)
    ui.jobs.add(t.id, t.title, { kind: "thumbnail", run: () => ui.services.thumbnail(t.id, out) });
  ui.toast(
    `Saving ${targets.length === 1 ? "thumbnail" : `${targets.length} thumbnails`} → ${tildify(out)}`,
    "ok",
  );
}

/** Choose quality (with sizes when known) and folder, remember both, then queue. */
export function downloadWithOptions(ui: Ui, targets: Target[], video?: Video | null) {
  const sizes = new Map((video?.qualities ?? []).map((q) => [q.label, q.bytes]));
  const best = video?.qualities[0];
  const options = QUALITY_ORDER.filter((q) => q === "best" || !video || sizes.has(q)).map((q) => {
    const size = q === "best" ? best?.bytes : sizes.get(q);
    return {
      value: q,
      label: q === "best" ? `Best available${best ? ` (${best.label})` : ""}` : q,
      hint: size ? `≈ ${bytes(size)}` : "",
    };
  });
  ui.push({
    kind: "choice",
    title:
      targets.length === 1 ? "Download quality" : `Download quality for ${targets.length} videos`,
    options,
    initial: Math.max(
      0,
      options.findIndex((o) => o.value === ui.prefs.videoQuality),
    ),
    onPick: (quality) => {
      ui.prefs.videoQuality = quality as Prefs["videoQuality"];
      ui.savePrefs();
      askFolder(ui, "Save to", ui.prefs.downloadDir, (dir) => {
        ui.prefs.downloadDir = dir;
        ui.savePrefs();
        queueVideos(ui, targets, "video", { quality: quality as Quality, dir });
      });
    },
  });
}

export function audioWithOptions(ui: Ui, targets: Target[]) {
  const options = [
    { value: "mp3", label: "MP3", hint: "plays everywhere" },
    { value: "m4a", label: "M4A (AAC)", hint: "original audio, no re-encoding" },
    { value: "opus", label: "Opus", hint: "smallest files" },
  ];
  ui.push({
    kind: "choice",
    title: "Audio format",
    options,
    initial: Math.max(
      0,
      options.findIndex((o) => o.value === ui.prefs.audioFormat),
    ),
    onPick: (format) => {
      ui.prefs.audioFormat = format as Prefs["audioFormat"];
      ui.savePrefs();
      askFolder(ui, "Save to", ui.prefs.downloadDir, (dir) => {
        ui.prefs.downloadDir = dir;
        ui.savePrefs();
        queueVideos(ui, targets, "audio", { dir });
      });
    },
  });
}

export const TRANSCRIPT_FORMATS: { value: TranscriptChoice; label: string; hint: string }[] = [
  { value: "txt", label: "Plain text", hint: ".txt" },
  { value: "txt-timestamps", label: "Text with timestamps", hint: ".txt, [mm:ss] per line" },
  { value: "srt", label: "SRT subtitles", hint: ".srt" },
  { value: "vtt", label: "WebVTT subtitles", hint: ".vtt" },
  { value: "json", label: "JSON", hint: "timings per line" },
];

/** Open a URL in the default browser (best effort). */
export function openInBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref();
  } catch {}
}
