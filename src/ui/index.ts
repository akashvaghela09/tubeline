// Interactive UI: `yt-data ui`, or bare `yt-data` at a terminal. Menus call the same
// services as the commands; nothing here shells out to the CLI.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pkg from "../../package.json";
import { runChecks } from "../commands/doctor.ts";
import { fetchThumbnail } from "../commands/thumbnail.ts";
import { toSrt, toTxt, toVtt } from "../core/captions.ts";
import type { AppContext } from "../core/context.ts";
import { channelHuman, doctorHuman, updateHuman, videoHuman } from "../core/human.ts";
import { parseRef, type Ref } from "../core/resolve.ts";
import { bytes, compact, duration, truncate } from "../core/style.ts";
import type { SearchResult } from "../models/search.ts";
import type { Transcript, Video, VideoSummary } from "../models/video.ts";
import {
  type AudioFormat,
  type DownloadResult,
  prepareDownload,
  type Quality,
} from "../services/download.ts";
import { getTranscript } from "../services/transcript.ts";
import type { ListType, SearchType } from "../sources/innertube.ts";
import { updateSelf } from "../update/self.ts";
import { updateYtDlp } from "../update/ytdlp.ts";
import {
  ask,
  askFolder,
  Back,
  type Choice,
  choose,
  confirm,
  pick,
  pickMany,
  showError,
  withSpinner,
} from "./ask.ts";
import { loadPrefs, type Prefs, safeName, savePrefs, type TranscriptChoice } from "./prefs.ts";

const PAGE = 50;

export async function runUi(ctx: AppContext): Promise<void> {
  const prefs = loadPrefs();
  const ui = new Ui(ctx, prefs);
  p.intro(` yt-data ${pkg.version} `);
  try {
    await ui.main();
  } finally {
    savePrefs(prefs);
  }
  p.outro("Bye!");
}

class Ui {
  constructor(
    private readonly ctx: AppContext,
    private readonly prefs: Prefs,
  ) {}

  private source() {
    return this.ctx.innertube();
  }

  /** Remember a choice right away (Ctrl+C during a spinner exits without unwinding). */
  private remember<K extends keyof Prefs>(key: K, value: Prefs[K]): Prefs[K] {
    this.prefs[key] = value;
    savePrefs(this.prefs);
    return value;
  }

  /** Run a submenu; Esc/Ctrl+C inside it returns here, errors are shown and the menu continues. */
  private async guard(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof Back)) showError(err);
    }
  }

  async main() {
    for (;;) {
      let action: string;
      try {
        action = await choose("What do you want to do?", [
          {
            value: "open",
            label: "Open a link or ID",
            hint: "video, channel, playlist or @handle",
          },
          { value: "search", label: "Search YouTube" },
          { value: "update", label: "Update yt-data & yt-dlp" },
          { value: "doctor", label: "Check setup" },
          { value: "quit", label: "Quit" },
        ]);
      } catch (err) {
        if (err instanceof Back) return;
        throw err;
      }
      if (action === "quit") return;
      if (action === "open") await this.guard(() => this.open());
      if (action === "search") await this.guard(() => this.search());
      if (action === "update") await this.guard(() => this.update());
      if (action === "doctor") await this.guard(() => this.doctor());
    }
  }

  // ── Entry points ──────────────────────────────────────────────────────────────

  private async open() {
    let ref: Ref | undefined;
    await ask("Paste a YouTube link, @handle or ID", {
      placeholder: "https://youtu.be/dQw4w9WgXcQ",
      validate: (v) => {
        try {
          ref = parseRef(v);
          return undefined;
        } catch (err) {
          return (err as Error).message;
        }
      },
    });
    if (!ref) return;
    if (ref.kind === "video") return this.videoMenu(ref.id);
    if (ref.kind === "playlist") return this.browse(ref, "videos", "Playlist");
    return this.channelMenu(ref);
  }

  private async search() {
    const query = await ask("Search for", {
      validate: (v) => (v.trim() ? undefined : "Type something to search"),
    });
    const type = await choose<SearchType>("Looking for", [
      { value: "video", label: "Videos" },
      { value: "shorts", label: "Shorts" },
      { value: "channel", label: "Channels" },
      { value: "playlist", label: "Playlists" },
    ]);
    const iter = (await this.source()).search(query, { type });
    const results: SearchResult[] = [];
    let exhausted = false;
    const loadMore = async () => {
      const more = await withSpinner(
        results.length ? "Loading more results" : `Searching for “${query}”`,
        () => take(iter, PAGE),
        (r) => `${results.length + r.length} results`,
      );
      if (more.length < PAGE) exhausted = true;
      results.push(...more);
    };
    await loadMore();
    if (!results.length) {
      p.log.warn("No results.");
      return;
    }
    for (;;) {
      const options: Choice<string>[] = results.map((r, i) => ({
        value: String(i),
        ...searchLabel(r),
      }));
      if (!exhausted) options.push({ value: "more", label: "↓ Load more results" });
      const choice = await pick(`${results.length} results for “${query}”`, options);
      if (choice === "more") {
        await loadMore();
        continue;
      }
      const r = results[Number(choice)] as SearchResult;
      await this.guard(async () => {
        if (r.type === "video") await this.videoMenu(r.id);
        else if (r.type === "channel") await this.channelMenu({ kind: "channel", id: r.id });
        else await this.browse({ kind: "playlist", id: r.id }, "videos", r.title);
      });
    }
  }

  // ── Channels and playlists ───────────────────────────────────────────────────

  private async channelMenu(ref: Ref) {
    const channel = await withSpinner(
      "Loading channel",
      async () => (await this.source()).getChannel(ref),
      (c) => c.name,
    );
    p.note(channelHuman([channel]).trim().split("\n").slice(0, 3).join("\n"), "Channel");
    const chRef: Ref = { kind: "channel", id: channel.id };
    for (;;) {
      const action = await choose("Channel", [
        { value: "videos", label: "Browse videos" },
        { value: "shorts", label: "Browse shorts" },
        { value: "streams", label: "Browse live streams" },
        { value: "all", label: "All uploads", hint: "newest first" },
        { value: "details", label: "Show full details" },
        { value: "back", label: "← Back" },
      ]);
      if (action === "back") return;
      if (action === "details") {
        process.stdout.write(`\n${channelHuman([channel])}\n`);
        continue;
      }
      await this.guard(() => this.browse(chRef, action as ListType, `${channel.name} — ${action}`));
    }
  }

  /** Paged, filterable list of a channel tab or playlist; pick one video or several. */
  private async browse(ref: Ref, type: ListType, title: string) {
    const iter = (await this.source()).listVideos(ref, { type });
    const items: VideoSummary[] = [];
    let exhausted = false;
    const loadMore = async () => {
      const more = await withSpinner(
        items.length ? "Loading more" : "Loading videos",
        () => take(iter, PAGE),
        (m) => `${items.length + m.length} videos`,
      );
      if (more.length < PAGE) exhausted = true;
      items.push(...more);
    };
    await loadMore();
    if (!items.length) {
      p.log.warn("Nothing here.");
      return;
    }
    for (;;) {
      const options: Choice<string>[] = [
        { value: "many", label: "☑ Select several…", hint: "download or save transcripts in bulk" },
        ...items.map((v, i) => ({ value: String(i), ...videoLabel(v) })),
      ];
      if (!exhausted) options.push({ value: "more", label: `↓ Load ${PAGE} more` });
      const choice = await pick(`${title} (${items.length}${exhausted ? "" : "+"})`, options);
      if (choice === "more") {
        await loadMore();
        continue;
      }
      if (choice === "many") {
        await this.guard(() => this.bulk(items));
        continue;
      }
      await this.guard(() => this.videoMenu((items[Number(choice)] as VideoSummary).id));
    }
  }

  private async bulk(items: VideoSummary[]) {
    const picked = await pickMany(
      "Select videos (space to toggle, enter to confirm)",
      items.map((v, i) => ({ value: i, ...videoLabel(v) })),
    );
    const videos = picked.map((i) => items[i] as VideoSummary);
    const action = await choose(`${videos.length} selected — do what?`, [
      { value: "video", label: "Download videos" },
      { value: "audio", label: "Download audio" },
      { value: "transcript", label: "Save transcripts" },
      { value: "thumbnail", label: "Download thumbnails" },
    ]);
    if (action === "video" || action === "audio") {
      const { quality, audioFormat, folder } = await this.askDownload(action);
      const { download, warning } = prepareDownload(
        { quality, audioFormat, output: folder },
        this.ctx.ytdlp,
      );
      if (warning) p.log.warn(warning);
      await this.each(videos, (v, i) =>
        this.runDownload(download, v.id, `${i}/${videos.length} ${truncate(v.title, 40)}`),
      );
    } else if (action === "transcript") {
      const format = await this.askTranscriptFormat();
      const folder = await askFolder("Save transcripts to", this.prefs.transcriptDir);
      this.remember("transcriptDir", folder);
      await this.each(videos, async (v, i) => {
        const t = await withSpinner(`${i}/${videos.length} ${truncate(v.title, 40)}`, () =>
          this.transcript(v.id),
        );
        this.saveTranscript(t, v.title, format, folder);
      });
    } else {
      const folder = await askFolder("Save thumbnails to", this.prefs.thumbnailDir);
      this.remember("thumbnailDir", folder);
      await this.each(videos, async (v, i) => {
        const r = await withSpinner(`${i}/${videos.length} ${truncate(v.title, 40)}`, () =>
          fetchThumbnail(this.ctx.fetch, v.id, { quality: "best", output: folder }),
        );
        p.log.success(`Saved ${r.path}`);
      });
    }
  }

  /** Run a step per video; one failure doesn't stop the rest. */
  private async each<T>(list: T[], fn: (item: T, n: number) => Promise<unknown>) {
    let failed = 0;
    for (const [i, item] of list.entries()) {
      try {
        await fn(item, i + 1);
      } catch (err) {
        failed++;
        showError(err);
      }
    }
    if (list.length > 1)
      p.log.info(`Done: ${list.length - failed} succeeded${failed ? `, ${failed} failed` : ""}.`);
  }

  // ── A single video ────────────────────────────────────────────────────────────

  private async videoMenu(id: string) {
    const video = await withSpinner(
      "Loading video",
      async () => (await this.source()).getVideo(id),
      (v) => truncate(v.title, 60),
    );
    p.note(videoSummaryNote(video), "Video");
    for (;;) {
      const action = await choose("Video", [
        { value: "video", label: "Download video" },
        { value: "audio", label: "Download audio" },
        {
          value: "transcript",
          label: "Transcript",
          hint: video.captions.length ? `${video.captions.length} tracks` : "no captions listed",
        },
        { value: "thumbnail", label: "Download thumbnail" },
        { value: "details", label: "Show full details" },
        { value: "channel", label: `Open channel: ${truncate(video.channel.name, 30)}` },
        { value: "back", label: "← Back" },
      ]);
      if (action === "back") return;
      await this.guard(async () => {
        switch (action) {
          case "video":
          case "audio": {
            const { quality, audioFormat, folder } = await this.askDownload(action);
            const { download, warning } = prepareDownload(
              { quality, audioFormat, output: folder },
              this.ctx.ytdlp,
            );
            if (warning) p.log.warn(warning);
            await this.runDownload(download, video.id, truncate(video.title, 50));
            break;
          }
          case "transcript":
            await this.transcriptMenu(video);
            break;
          case "thumbnail": {
            const folder = await askFolder("Save thumbnail to", this.prefs.thumbnailDir);
            this.remember("thumbnailDir", folder);
            const r = await withSpinner("Downloading thumbnail", () =>
              fetchThumbnail(this.ctx.fetch, video.id, { quality: "best", output: folder }),
            );
            p.log.success(`Saved ${r.path} (${r.width}×${r.height}, ${bytes(r.sizeBytes)})`);
            break;
          }
          case "details":
            process.stdout.write(`\n${videoHuman([video])}\n`);
            break;
          case "channel":
            await this.channelMenu({ kind: "channel", id: video.channel.id });
            break;
        }
      });
    }
  }

  private async askDownload(
    kind: "video" | "audio",
  ): Promise<{ quality: Quality; audioFormat: AudioFormat; folder: string }> {
    let quality: Quality = "audio";
    if (kind === "video") {
      quality = await choose<Quality>(
        "Quality",
        (["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"] as const).map((q) => ({
          value: q,
          label: q === "best" ? "Best available" : `Up to ${q}`,
        })),
        this.prefs.videoQuality,
      );
      this.remember("videoQuality", quality as Prefs["videoQuality"]);
    } else {
      const format = await choose<AudioFormat>(
        "Audio format",
        [
          { value: "mp3", label: "MP3", hint: "most compatible" },
          { value: "m4a", label: "M4A (AAC)", hint: "no re-encoding" },
          { value: "opus", label: "Opus", hint: "smallest" },
        ],
        this.prefs.audioFormat,
      );
      this.remember("audioFormat", format);
    }
    const folder = await askFolder("Save to", this.prefs.downloadDir);
    this.remember("downloadDir", folder);
    return { quality, audioFormat: this.prefs.audioFormat, folder };
  }

  private async runDownload(
    download: ReturnType<typeof prepareDownload>["download"],
    id: string,
    label: string,
  ): Promise<DownloadResult> {
    const bar = p.progress({ max: 100, style: "heavy" });
    bar.start(`Downloading ${label}`);
    let last = 0;
    try {
      const result = await download(id, ({ percent, line }) => {
        if (percent !== null) {
          // yt-dlp restarts at 0% for the audio stream; keep the bar moving forward per stream.
          if (percent < last) last = 0;
          bar.advance(
            Math.max(0, Math.round(percent) - Math.round(last)),
            `Downloading ${label} ${percent.toFixed(0)}%`,
          );
          last = percent;
        } else if (/^\[(Merger|ExtractAudio|VideoConvertor)\]/.test(line)) {
          bar.message(`Processing ${label}`);
        }
      });
      bar.stop(`Saved ${result.path} (${result.resolution}, ${bytes(result.sizeBytes)})`);
      return result;
    } catch (err) {
      bar.error(`Download failed: ${label}`);
      throw err;
    }
  }

  private transcript(id: string, lang?: string): Promise<Transcript> {
    return this.source().then((source) =>
      getTranscript(
        { source, fetch: this.ctx.fetch, cache: this.ctx.cache, ytdlp: this.ctx.ytdlp },
        id,
        {
          lang,
          prefer: "manual",
        },
      ),
    );
  }

  private async transcriptMenu(video: Video) {
    let lang: string | undefined;
    const langs = [...new Map(video.captions.map((c) => [c.lang, c])).values()];
    if (langs.length > 1) {
      lang = await choose(
        "Language",
        langs.map((c) => ({
          value: c.lang,
          label: c.name,
          hint: c.isAuto ? "auto-generated" : c.lang,
        })),
        langs.find((c) => c.lang.startsWith("en"))?.lang,
      );
    }
    const t = await withSpinner(
      "Fetching transcript",
      () => this.transcript(video.id, lang),
      (t) => `${t.segments.length} lines (${t.name ?? t.lang})`,
    );
    const action = await choose("Transcript", [
      { value: "save", label: "Save to a file" },
      { value: "show", label: "Show here" },
    ]);
    if (action === "show") {
      process.stdout.write(`\n${toTxt(t.segments, true)}\n`);
      return;
    }
    const format = await this.askTranscriptFormat();
    const folder = await askFolder("Save to", this.prefs.transcriptDir);
    this.remember("transcriptDir", folder);
    this.saveTranscript(t, video.title, format, folder);
  }

  private async askTranscriptFormat(): Promise<TranscriptChoice> {
    const format = await choose<TranscriptChoice>(
      "Format",
      [
        { value: "txt", label: "Plain text" },
        { value: "txt-timestamps", label: "Text with [mm:ss] timestamps" },
        { value: "srt", label: "SRT subtitles" },
        { value: "vtt", label: "WebVTT subtitles" },
        { value: "json", label: "JSON", hint: "timings per line" },
      ],
      this.prefs.transcriptFormat,
    );
    return this.remember("transcriptFormat", format);
  }

  private saveTranscript(t: Transcript, title: string, format: TranscriptChoice, folder: string) {
    const ext = format === "txt-timestamps" ? "txt" : format;
    const body =
      format === "srt"
        ? toSrt(t.segments)
        : format === "vtt"
          ? toVtt(t.segments)
          : format === "json"
            ? `${JSON.stringify(t, null, 2)}\n`
            : toTxt(t.segments, format === "txt-timestamps");
    const path = join(folder, `${safeName(title)} [${t.videoId}].${t.lang}.${ext}`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path, body);
    p.log.success(`Saved ${path}`);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────────

  private async update() {
    if (!(await confirm("Update yt-data and the managed yt-dlp now?"))) return;
    const result: Record<string, unknown> = {};
    await withSpinner("Updating", async () => {
      result.self = await updateSelf(this.ctx.fetch).catch((e: Error) => ({
        action: "skipped",
        reason: e.message,
      }));
      result.ytDlp = await updateYtDlp(this.ctx.fetch, "stable").catch((e: Error) => ({
        action: "failed",
        message: e.message,
      }));
    });
    p.log.message(updateHuman([result]).trimEnd());
  }

  private async doctor() {
    const checks = await withSpinner("Checking", () => runChecks(this.ctx, true));
    const ok = !checks.some((c) => c.required && !c.ok);
    p.log.message(
      doctorHuman([
        { ok, version: pkg.version, platform: `${process.platform}-${process.arch}`, checks },
      ]).trimEnd(),
    );
  }
}

async function take<T>(iter: AsyncGenerator<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  while (out.length < n) {
    const next = await iter.next();
    if (next.done) break;
    out.push(next.value);
  }
  return out;
}

function videoLabel(v: VideoSummary): { label: string; hint: string } {
  const hint = [
    v.viewCount !== null ? `${compact(v.viewCount)} views` : null,
    v.publishedText,
    v.durationSeconds !== null ? duration(v.durationSeconds) : null,
    v.isLive ? "LIVE" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { label: truncate(v.title, 70), hint };
}

function searchLabel(r: SearchResult): { label: string; hint: string } {
  if (r.type === "video") {
    return {
      label: truncate(r.title, 65),
      hint: [
        r.channel.name,
        `${compact(r.viewCount)} views`,
        r.publishedText,
        duration(r.durationSeconds),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (r.type === "channel") {
    return {
      label: `${r.name} ${r.handle ?? ""}`.trim(),
      hint: `${compact(r.subscriberCount)} subscribers`,
    };
  }
  return {
    label: truncate(r.title, 65),
    hint: [r.channelName, r.videoCount !== null ? `${r.videoCount} videos` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

function videoSummaryNote(v: Video): string {
  return [
    truncate(v.title, 70),
    `${v.channel.name} · ${compact(v.viewCount)} views · ${duration(v.durationSeconds)}${v.publishedAt ? ` · ${v.publishedAt.slice(0, 10)}` : ""}`,
    v.url,
    ...(v.playability.status !== "OK"
      ? [`⚠ ${v.playability.status}: ${v.playability.reason ?? ""}`]
      : []),
  ].join("\n");
}
