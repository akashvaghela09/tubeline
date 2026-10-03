// Everything the interactive UI needs from the rest of the app, behind one interface so
// screens can be tested with fakes (no network, no yt-dlp).
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";
import { runChecks, ytDlpAgeDays } from "../commands/doctor.ts";
import { fetchThumbnail } from "../commands/thumbnail.ts";
import { toSrt, toTxt, toVtt } from "../core/captions.ts";
import type { AppContext } from "../core/context.ts";
import { doctorHuman, updateHuman } from "../core/human.ts";
import type { Ref } from "../core/resolve.ts";
import { setColor } from "../core/style.ts";
import type { Channel } from "../models/channel.ts";
import type { SearchResult } from "../models/search.ts";
import type { Transcript, Video, VideoSummary } from "../models/video.ts";
import {
  type AudioFormat,
  type DownloadResult,
  type Progress,
  prepareDownload,
  type Quality,
} from "../services/download.ts";
import { getTranscript } from "../services/transcript.ts";
import type { ListType, SearchType } from "../sources/innertube.ts";
import { findYtDlp, runYtDlp } from "../sources/ytdlp.ts";
import { updateSelf } from "../update/self.ts";
import { updateYtDlp } from "../update/ytdlp.ts";
import { safeName, type TranscriptChoice } from "./prefs.ts";

export interface DownloadSpec {
  kind: "video" | "audio";
  quality: Quality;
  audioFormat: AudioFormat;
  dir: string;
}

export interface UiServices {
  version: string;
  getVideo(id: string): Promise<Video>;
  getChannel(ref: Ref): Promise<Channel>;
  listVideos(ref: Ref, type: ListType): AsyncGenerator<VideoSummary>;
  search(query: string, type: SearchType): AsyncGenerator<SearchResult>;
  getTranscript(id: string, lang?: string): Promise<Transcript>;
  saveTranscript(t: Transcript, title: string, format: TranscriptChoice, dir: string): string;
  thumbnail(id: string, dir: string): Promise<string>;
  download(
    id: string,
    spec: DownloadSpec,
    onProgress: (p: Progress) => void,
    signal: AbortSignal,
  ): Promise<DownloadResult>;
  /** Path of an existing download of this video in `dir`, if any. */
  existing(id: string, dir: string): string | null;
  update(): Promise<string>;
  doctor(): Promise<string>;
  /** Age in days of the yt-dlp that downloads would use; null if unknown/missing. */
  ytDlpAge(): Promise<number | null>;
}

export function realServices(ctx: AppContext): UiServices {
  const source = () => ctx.innertube();
  return {
    version: pkg.version,
    getVideo: async (id) => (await source()).getVideo(id),
    getChannel: async (ref) => (await source()).getChannel(ref),
    async *listVideos(ref, type) {
      yield* (await source()).listVideos(ref, { type });
    },
    async *search(query, type) {
      yield* (await source()).search(query, { type });
    },
    getTranscript: async (id, lang) =>
      getTranscript(
        { source: await source(), fetch: ctx.fetch, cache: ctx.cache, ytdlp: ctx.ytdlp },
        id,
        {
          lang,
          prefer: "manual",
        },
      ),
    saveTranscript(t, title, format, dir) {
      const ext = format === "txt-timestamps" ? "txt" : format;
      const body =
        format === "srt"
          ? toSrt(t.segments)
          : format === "vtt"
            ? toVtt(t.segments)
            : format === "json"
              ? `${JSON.stringify(t, null, 2)}\n`
              : toTxt(t.segments, format === "txt-timestamps");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${safeName(title)} [${t.videoId}].${t.lang}.${ext}`);
      writeFileSync(path, body);
      return path;
    },
    thumbnail: async (id, dir) => {
      const r = await fetchThumbnail(ctx.fetch, id, { quality: "best", output: dir });
      return r.path as string;
    },
    download(id, spec, onProgress, signal) {
      const { download } = prepareDownload(
        {
          quality: spec.kind === "audio" ? "audio" : spec.quality,
          audioFormat: spec.audioFormat,
          output: spec.dir,
        },
        ctx.ytdlp,
      );
      return download(id, onProgress, signal);
    },
    existing(id, dir) {
      try {
        const hit = readdirSync(dir).find(
          (f) =>
            f.includes(`[${id}]`) && !/\.(part|ytdl|jpg|webp|txt|srt|vtt|json)$|\.f\d+\./.test(f),
        );
        return hit ? join(dir, hit) : null;
      } catch {
        return null;
      }
    },
    async update() {
      const result: Record<string, unknown> = {};
      result.self = await updateSelf(ctx.fetch).catch((e: Error) => ({
        action: "skipped",
        reason: e.message,
      }));
      result.ytDlp = await updateYtDlp(ctx.fetch, "stable").catch((e: Error) => ({
        action: "failed",
        message: e.message,
      }));
      setColor(false);
      return updateHuman([result]);
    },
    async doctor() {
      const checks = await runChecks(ctx, true);
      setColor(false);
      const ok = !checks.some((c) => c.required && !c.ok);
      return doctorHuman([
        { ok, version: pkg.version, platform: `${process.platform}-${process.arch}`, checks },
      ]);
    },
    async ytDlpAge() {
      const found = findYtDlp();
      if (!found) return null;
      const res = await runYtDlp(found.path, ["--version"]).catch(() => null);
      return res?.code === 0 ? ytDlpAgeDays(res.stdout.trim()) : null;
    },
  };
}
