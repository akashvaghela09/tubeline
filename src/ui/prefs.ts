// Remembered choices for the interactive UI (download folder, quality, formats).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appPaths } from "../core/paths.ts";
import type { AudioFormat, Quality } from "../services/download.ts";

export type TranscriptChoice = "txt" | "txt-timestamps" | "srt" | "vtt" | "json";

export interface Prefs {
  downloadDir: string;
  videoQuality: Exclude<Quality, "audio">;
  audioFormat: AudioFormat;
  transcriptFormat: TranscriptChoice;
  transcriptDir: string;
  thumbnailDir: string;
}

const file = () => join(appPaths().data, "ui.json");

/** The user's Downloads folder (XDG user dirs on Linux), else ~/Downloads. */
export function downloadsDir(): string {
  if (process.platform === "linux") {
    try {
      const res = Bun.spawnSync(["xdg-user-dir", "DOWNLOAD"], { stdout: "pipe", stderr: "ignore" });
      const dir = res.stdout.toString().trim();
      if (res.exitCode === 0 && dir && dir !== homedir()) return dir;
    } catch {}
  }
  return join(homedir(), "Downloads");
}

export function loadPrefs(): Prefs {
  const dl = downloadsDir();
  const defaults: Prefs = {
    downloadDir: dl,
    videoQuality: "best",
    audioFormat: "mp3",
    transcriptFormat: "txt",
    transcriptDir: dl,
    thumbnailDir: dl,
  };
  try {
    return { ...defaults, ...(JSON.parse(readFileSync(file(), "utf8")) as Partial<Prefs>) };
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    mkdirSync(appPaths().data, { recursive: true });
    writeFileSync(file(), JSON.stringify(prefs, null, 2));
  } catch {}
}

export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

/** Turn a video title into a safe file name. */
export function safeName(name: string): string {
  return (
    name
      .replace(/\s+/g, " ")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are invalid in file names
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .trim()
      .slice(0, 150) || "untitled"
  );
}
