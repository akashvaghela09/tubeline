// InnerTube (YouTube's internal JSON API) via youtubei.js, mapped onto our models.
import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Innertube, Log, UniversalCache } from "youtubei.js";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { log } from "../core/log.ts";
import {
  handleFromUrl,
  parseCount,
  parseDescriptionChapters,
  parseDisplayDate,
  toUtcIso,
  unwrapRedirect,
} from "../core/parse.ts";
import { channelUrl, type Ref, refKindLabel, videoUrl } from "../core/resolve.ts";
import type { Channel } from "../models/channel.ts";
import type { Image } from "../models/common.ts";
import type { Video } from "../models/video.ts";

// The library logs parser drift loudly to the console; we surface problems ourselves.
Log.setLevel(Log.Level.NONE);

// youtubei.js node types are deep unions that change between releases; mapping code reads
// them structurally and validates the result against our zod models instead.
// biome-ignore lint/suspicious/noExplicitAny: see above
type Loose = any;

const SESSION_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

export interface InnertubeOptions {
  region: string;
  fetch: FetchFn;
  cookie?: string;
  /** Directory for the persisted session; omit to disable caching. */
  cacheDir?: string;
}

export async function createInnertube(opts: InnertubeOptions): Promise<Innertube> {
  let cache: UniversalCache | undefined;
  if (opts.cacheDir) {
    const dir = join(opts.cacheDir, "innertube");
    expireSession(dir);
    cache = new UniversalCache(true, dir);
  }
  try {
    return await Innertube.create({
      // Interface language is pinned so display strings ("21.3M subscribers") parse reliably.
      lang: "en",
      location: opts.region,
      retrieve_player: false,
      cookie: opts.cookie,
      fetch: opts.fetch as typeof fetch,
      cache,
    });
  } catch (err) {
    throw mapLibraryError(err);
  }
}

/** Refresh the cached visitor session every few days so it doesn't go stale. */
function expireSession(dir: string) {
  const file = join(dir, "innertube_session_data");
  try {
    if (Date.now() - statSync(file).mtimeMs > SESSION_MAX_AGE_MS) rmSync(file);
  } catch {}
}

export class InnertubeSource {
  constructor(private readonly yt: Innertube) {}

  async resolveChannelId(ref: Ref): Promise<string> {
    if (ref.kind === "channel") return ref.id;
    if (ref.kind !== "channelUrl") {
      throw new CliError(
        "USAGE",
        `Expected a channel, got a ${refKindLabel(ref)}`,
        "Pass an @handle, channel URL or UC… id",
      );
    }
    let endpoint: Loose;
    try {
      endpoint = await this.yt.resolveURL(ref.url);
    } catch (err) {
      throw mapLibraryError(err, `Channel ${ref.url} not found`);
    }
    const id = endpoint?.payload?.browseId;
    if (typeof id !== "string" || !id.startsWith("UC")) {
      throw new CliError("NOT_FOUND", `${ref.url} is not a channel`);
    }
    return id;
  }

  async getChannel(ref: Ref): Promise<Channel> {
    const id = await this.resolveChannelId(ref);
    let channel: Loose;
    try {
      channel = await this.yt.getChannel(id);
    } catch (err) {
      throw mapLibraryError(err, `Channel ${id} not found`);
    }
    let about: Loose = null;
    try {
      about = channel.has_about ? await channel.getAbout() : null;
    } catch (err) {
      log.warn(
        `channel ${id}: could not load about panel (${(err as Error).message}); some fields will be null`,
      );
    }
    return mapChannel(channel, about?.metadata ?? null);
  }

  async getVideo(id: string): Promise<Video> {
    // WEB /player + /next carries the metadata; without a player script WEB reports the
    // video as unplayable and omits caption tracks, so ANDROID /player supplies those.
    const [info, android] = await Promise.all([
      this.yt.getInfo(id).catch((err: unknown) => {
        throw mapLibraryError(err, `Video ${id} not found`);
      }),
      this.yt.getBasicInfo(id, { client: "ANDROID" }).catch((err: unknown) => {
        log.debug(`video ${id}: ANDROID player request failed: ${(err as Error).message}`);
        return null;
      }),
    ]);
    const video = mapVideo(info, android);
    if (!video.title) {
      // Bot checks and hard blocks come back as a player response with no video details.
      const reason = video.playability.reason ?? "no video details returned";
      if (/not a bot/i.test(reason)) {
        throw new CliError(
          "RATE_LIMITED",
          `YouTube bot check: ${reason}`,
          "Use --cookies or --proxy, or retry later",
        );
      }
      throw new CliError(
        "UNAVAILABLE",
        `Video ${id} is unavailable: ${reason}`,
        "Pass --cookies if it needs sign-in",
      );
    }
    return video;
  }
}

export function mapChannel(channel: Loose, about: Loose): Channel {
  const meta = channel.metadata ?? {};
  const header = channel.header?.content ?? null;
  const id: string = meta.external_id ?? about?.channel_id;
  if (!id)
    throw new CliError(
      "INTERNAL",
      "Channel response had no channel id",
      "YouTube may have changed its format",
    );

  const headerRows: string[] = (header?.metadata?.metadata_rows ?? []).flatMap((row: Loose) =>
    (row.metadata_parts ?? []).map((p: Loose) => p.text?.text).filter(Boolean),
  );
  const subscriberCountText: string | null =
    about?.subscriber_count ?? headerRows.find((t) => /subscriber/i.test(t)) ?? null;
  const videoCountText: string | null =
    about?.video_count ?? headerRows.find((t) => /video/i.test(t)) ?? null;

  const handle =
    handleFromUrl(meta.vanity_channel_url) ??
    handleFromUrl(about?.canonical_channel_url) ??
    headerRows.find((t) => t.startsWith("@")) ??
    null;

  const links = (about?.links ?? [])
    .map((l: Loose) => {
      const target = l.link?.runs?.[0]?.endpoint?.payload?.url ?? l.link?.text;
      return target
        ? { title: l.title?.text ?? "", url: normalizeLink(unwrapRedirect(target)) }
        : null;
    })
    .filter(Boolean);

  return {
    id,
    handle,
    name: meta.title ?? header?.title?.text?.text ?? "",
    description: about?.description ?? meta.description ?? "",
    url: channelUrl(id),
    subscriberCount: parseCount(subscriberCountText),
    subscriberCountText,
    videoCount: parseCount(videoCountText),
    viewCount: parseCount(about?.view_count),
    joinedAt: parseDisplayDate(about?.joined_date?.text),
    country: about?.country ?? null,
    isVerified: hasVerifiedMark(header?.title),
    isFamilySafe: meta.is_family_safe ?? null,
    keywords:
      Array.isArray(meta.tags) && meta.tags.length ? meta.tags : splitKeywords(meta.keywords),
    links,
    avatar: firstImage(meta.avatar ?? header?.image?.avatar?.image),
    banner: firstImage(header?.banner?.image),
    rssUrl: meta.rss_url ?? null,
  };
}

export function mapVideo(info: Loose, android: Loose): Video {
  const basic = info.basic_info ?? {};
  const id: string = basic.id;
  const microformat = info.page?.[0]?.microformat ?? {};
  const owner = info.secondary_info?.owner ?? null;
  const ownerChannelId: string = basic.channel?.id ?? basic.channel_id ?? owner?.author?.id;

  const commentsPanel = (info.page?.[1]?.engagement_panels ?? []).find(
    (p: Loose) => p.panel_identifier === "engagement-panel-comments-section",
  );
  const commentCountText: string | null = commentsPanel?.header?.contextual_info?.text ?? null;

  const description: string =
    info.secondary_info?.description?.text ?? basic.short_description ?? "";

  const captionSource = info.captions?.caption_tracks?.length ? info.captions : android?.captions;
  const captions = (captionSource?.caption_tracks ?? []).map((c: Loose) => ({
    lang: c.language_code,
    name: c.name?.text ?? c.language_code,
    isAuto: c.kind === "asr",
    isTranslatable: !!c.is_translatable,
  }));

  // Prefer ANDROID's playability: WEB without a player script always says UNPLAYABLE.
  const playability = android?.playability_status ?? info.playability_status ?? {};
  const subscriberCountText: string | null = owner?.subscriber_count?.text ?? null;

  return {
    id,
    url: videoUrl(id),
    title: basic.title ?? "",
    description,
    durationSeconds: numberOrNull(basic.duration),
    viewCount: numberOrNull(basic.view_count),
    likeCount: numberOrNull(basic.like_count),
    commentCount: parseCount(commentCountText),
    commentCountText,
    publishedAt: toUtcIso(microformat.publish_date),
    uploadedAt: toUtcIso(microformat.upload_date),
    channel: {
      id: ownerChannelId,
      name: basic.channel?.name ?? basic.author ?? owner?.author?.name ?? "",
      handle: handleFromUrl(basic.channel?.url) ?? handleFromUrl(owner?.author?.url),
      url: channelUrl(ownerChannelId),
      subscriberCount: parseCount(subscriberCountText),
      subscriberCountText,
      isVerified: (owner?.author?.badges ?? []).some((b: Loose) => /VERIFIED/.test(b.style ?? "")),
    },
    category: basic.category ?? microformat.category ?? null,
    keywords: basic.keywords ?? [],
    isLive: !!basic.is_live,
    isLiveContent: !!basic.is_live_content,
    isUpcoming: !!basic.is_upcoming,
    isUnlisted: basic.is_unlisted ?? null,
    isFamilySafe: basic.is_family_safe ?? null,
    thumbnails: videoThumbnails(id, basic.thumbnail),
    captions,
    chapters: playerChapters(info) ?? parseDescriptionChapters(description),
    playability: {
      status: playability.status ?? "UNKNOWN",
      reason: playability.reason || null,
    },
  };
}

function playerChapters(info: Loose): Video["chapters"] | null {
  const markers = info.player_overlays?.decorated_player_bar?.player_bar?.markers_map ?? [];
  for (const m of markers) {
    const chapters = m.value?.chapters;
    if (Array.isArray(chapters) && chapters.length) {
      return chapters.map((c: Loose) => ({
        title: c.title?.text ?? "",
        startSeconds: Math.floor((c.time_range_start_millis ?? 0) / 1000),
      }));
    }
  }
  return null;
}

/** InnerTube's thumbnail list varies by client; the i.ytimg.com URLs are stable. */
function videoThumbnails(id: string, fromApi: Loose): Image[] {
  const images = (Array.isArray(fromApi) ? fromApi : [])
    .map((t: Loose) => image(t))
    .filter((t: Image | null): t is Image => t !== null);
  if (images.length) return images;
  return [
    { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720 },
    { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 },
  ];
}

function image(t: Loose): Image | null {
  if (!t?.url) return null;
  const url = String(t.url).startsWith("//") ? `https:${t.url}` : String(t.url);
  return { url, width: numberOrNull(t.width), height: numberOrNull(t.height) };
}

function firstImage(list: Loose): Image | null {
  return Array.isArray(list) && list.length ? image(list[0]) : null;
}

function hasVerifiedMark(title: Loose): boolean {
  return JSON.stringify(title ?? {}).includes("CHECK_CIRCLE");
}

function normalizeLink(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** Channel keywords arrive as one string with quoted multi-word phrases. */
export function splitKeywords(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return [...value.matchAll(/"([^"]+)"|(\S+)/g)].map((m) => (m[1] ?? m[2]) as string);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Translate youtubei.js / transport failures into typed CLI errors. */
export function mapLibraryError(err: unknown, notFoundMessage?: string): CliError {
  if (err instanceof CliError) return err;
  const e = err as Error;
  const name = e?.constructor?.name ?? "";
  const message = e?.message ?? String(err);
  const info = JSON.stringify((e as Loose)?.info ?? "");

  if (
    name === "ChannelError" ||
    /does not exist|unavailable|not found|"code":\s*404/i.test(message + info)
  ) {
    return new CliError(
      "NOT_FOUND",
      notFoundMessage ?? message,
      "It may be private, removed, or the id is wrong",
    );
  }
  if (/429|too many requests/i.test(message + info)) {
    return new CliError(
      "RATE_LIMITED",
      "YouTube rate-limited this client",
      "Wait and retry, or use --cookies / --proxy",
    );
  }
  if (/not a bot|confirm you.re not/i.test(message)) {
    return new CliError(
      "RATE_LIMITED",
      "YouTube is asking to confirm this is not a bot",
      "Use --cookies or --proxy",
    );
  }
  if (/sign in|login required|private/i.test(message)) {
    return new CliError("UNAVAILABLE", message, "Pass --cookies from a logged-in browser session");
  }
  return new CliError(
    "INTERNAL",
    `YouTube request failed: ${message}`,
    "Run with -v for details; YouTube may have changed its format",
  );
}
