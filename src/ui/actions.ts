// Actions shared by the screens: the download panel, queueing jobs, the folder picker.
import { existsSync, mkdirSync, statSync } from "node:fs";
import type { Video } from "../models/video.ts";
import type { AudioFormat, Quality } from "../services/download.ts";
import type { Ui } from "./app.tsx";
import { tildify } from "./format.ts";
import { expandHome, rememberDir, type TranscriptChoice } from "./prefs.ts";
import { newDownload } from "./screens/download.tsx";

export interface Target {
  id: string;
  title: string;
}

/** Open the folder picker; on Enter the folder is created if needed, remembered, then `then`. */
export function askFolder(ui: Ui, title: string, initial: string, then: (dir: string) => void) {
  ui.push({
    kind: "folder",
    model: {
      title,
      initial,
      onSubmit(value) {
        const dir = expandHome(value.trim() || initial);
        try {
          if (existsSync(dir) && !statSync(dir).isDirectory())
            return `${dir} is a file, not a folder`;
          mkdirSync(dir, { recursive: true });
        } catch (err) {
          return `Can't use ${dir}: ${(err as Error).message}`;
        }
        rememberDir(ui.prefs, dir);
        ui.savePrefs();
        then(dir);
        return undefined;
      },
    },
  });
}

/** `d` / `a`: open the download panel with the remembered defaults. */
export function openDownload(
  ui: Ui,
  targets: Target[],
  video: Video | null,
  mode: "video" | "audio",
) {
  if (!targets.length) return ui.toast("Select one or more videos first", "error");
  ui.push({ kind: "download", model: newDownload(ui.prefs, targets, video, mode) });
}

export function queueMedia(
  ui: Ui,
  targets: Target[],
  kind: "video" | "audio",
  opts: { quality: Quality; format: AudioFormat; dir: string },
) {
  const spec = { kind, quality: opts.quality, audioFormat: opts.format, dir: opts.dir };
  for (const t of targets) ui.jobs.add(t.id, t.title, { kind, spec });
  rememberDir(ui.prefs, opts.dir);
  ui.savePrefs();
  const what =
    kind === "audio" ? opts.format : opts.quality === "best" ? "best quality" : opts.quality;
  ui.toast(
    `Downloading ${targets.length === 1 ? `“${targets[0]?.title}”` : `${targets.length} videos`} · ${what} → ${tildify(opts.dir)}`,
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
    ui.jobs.add(t.id, t.title, {
      kind: "thumbnail",
      run: () => ui.services.thumbnail(t.id, out, t.title),
    });
  ui.toast(
    `Saving ${targets.length === 1 ? "thumbnail" : `${targets.length} thumbnails`} → ${tildify(out)}`,
    "ok",
  );
}

export const TRANSCRIPT_FORMATS: { value: TranscriptChoice; label: string; hint: string }[] = [
  { value: "txt", label: "Plain text", hint: ".txt" },
  { value: "txt-timestamps", label: "Text with timestamps", hint: ".txt, [mm:ss] per line" },
  { value: "srt", label: "SRT subtitles", hint: ".srt" },
  { value: "vtt", label: "WebVTT subtitles", hint: ".vtt" },
  { value: "json", label: "JSON", hint: "timings per line" },
];

/** Open a URL or folder with the system's default app (best effort). */
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
