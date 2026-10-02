// Transcript retrieval: InnerTube caption track first, yt-dlp as fallback (also used for
// languages that only exist as YouTube machine translations).
import type { ResponseCache } from "../core/cache.ts";
import { parseSrv3 } from "../core/captions.ts";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { log } from "../core/log.ts";
import type { Transcript, TranscriptSegment } from "../models/video.ts";
import type { CaptionTrackRef, InnertubeSource } from "../sources/innertube.ts";
import { fetchSubtitles, type YtDlpOptions } from "../sources/ytdlp.ts";

export type Prefer = "manual" | "auto";

export interface TranscriptDeps {
  source: InnertubeSource;
  fetch: FetchFn;
  cache: ResponseCache;
  ytdlp: YtDlpOptions | false;
}

export interface TranscriptOptions {
  /** Requested language; omitted = English if available, else the first track. */
  lang?: string;
  prefer: Prefer;
}

const base = (lang: string) => lang.toLowerCase().split("-")[0] as string;

/**
 * Pick a track for `lang` (default English): same base language required, ranked by the
 * manual/auto preference first and an exact code match second. Without an explicit --lang
 * and no English track, the first track (the video's original language) is used.
 */
export function chooseTrack(
  tracks: CaptionTrackRef[],
  opts: TranscriptOptions,
): CaptionTrackRef | undefined {
  const want = (opts.lang ?? "en").toLowerCase();
  const rank = (t: CaptionTrackRef) =>
    (t.isAuto === (opts.prefer === "auto") ? 0 : 2) + (t.lang.toLowerCase() === want ? 0 : 1);
  const byRank = (list: CaptionTrackRef[]) => [...list].sort((a, b) => rank(a) - rank(b));
  const match = byRank(tracks.filter((t) => base(t.lang) === base(want)))[0];
  if (match || opts.lang) return match;
  const preferred = tracks.filter((t) => t.isAuto === (opts.prefer === "auto"));
  return preferred[0] ?? tracks[0];
}

export async function getTranscript(
  deps: TranscriptDeps,
  id: string,
  opts: TranscriptOptions,
): Promise<Transcript> {
  const cacheKey = `${id}:${opts.lang ?? ""}:${opts.prefer}`;
  const cached = deps.cache.get<Transcript>("transcript", cacheKey);
  if (cached) return cached;

  let tracks: CaptionTrackRef[] = [];
  let trackError: CliError | undefined;
  try {
    tracks = await deps.source.getCaptionTracks(id);
  } catch (err) {
    if (err instanceof CliError && err.code === "NOT_FOUND") throw err;
    trackError = err instanceof CliError ? err : new CliError("INTERNAL", String(err));
    log.debug(`video ${id}: caption track lookup failed: ${trackError.message}`);
  }

  const track = chooseTrack(tracks, opts);
  if (track) {
    if (!opts.lang && base(track.lang) !== "en")
      log.info(`video ${id}: no English captions, using ${track.lang}`);
    try {
      const segments = await fetchTrack(deps.fetch, track);
      if (segments.length)
        return remember(deps, cacheKey, { ...trackMeta(id, track), source: "innertube", segments });
      log.debug(`video ${id}: caption track ${track.lang} was empty`);
    } catch (err) {
      log.debug(`video ${id}: caption track fetch failed: ${(err as Error).message}`);
    }
  }

  // Fallback: yt-dlp — for failed InnerTube fetches and for translated languages.
  if (deps.ytdlp !== false) {
    const lang = track?.lang ?? opts.lang ?? (tracks.length ? undefined : "en");
    if (lang) {
      const native = tracks.some((t) => base(t.lang) === base(lang));
      const result = await viaYtDlp(
        id,
        lang,
        track ? track.isAuto : opts.prefer === "auto",
        deps.ytdlp,
      ).catch((err: unknown) => {
        if (err instanceof CliError && err.code === "MISSING_DEPENDENCY") {
          log.debug("yt-dlp not installed; skipping transcript fallback");
          return null;
        }
        throw err;
      });
      if (result) {
        const transcript: Transcript = {
          videoId: id,
          lang,
          name: track?.name ?? null,
          isAuto: result.isAuto,
          isTranslated: !native && tracks.length > 0,
          source: "yt-dlp",
          segments: result.segments,
        };
        return remember(deps, cacheKey, transcript);
      }
    }
  }

  if (trackError && !tracks.length) throw trackError;
  if (!tracks.length) throw new CliError("NOT_FOUND", `Video ${id} has no captions`);
  throw new CliError(
    "NOT_FOUND",
    `Video ${id} has no ${opts.lang} captions`,
    `Available: ${[...new Set(tracks.map((t) => t.lang))].join(", ")}`,
  );
}

async function fetchTrack(fetchFn: FetchFn, track: CaptionTrackRef): Promise<TranscriptSegment[]> {
  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "srv3");
  const res = await fetchFn(url.toString());
  const body = await res.text();
  if (!res.ok || !body.includes("<timedtext")) throw new Error(`timedtext HTTP ${res.status}`);
  return parseSrv3(body);
}

async function viaYtDlp(id: string, lang: string, auto: boolean, opts: YtDlpOptions) {
  // Try the preferred kind first, then the other one.
  for (const isAuto of [auto, !auto]) {
    const segments = await fetchSubtitles(id, lang, isAuto, opts);
    if (segments?.length) return { segments, isAuto };
  }
  return null;
}

function trackMeta(id: string, track: CaptionTrackRef) {
  return {
    videoId: id,
    lang: track.lang,
    name: track.name,
    isAuto: track.isAuto,
    isTranslated: false,
  };
}

function remember(deps: TranscriptDeps, key: string, t: Transcript): Transcript {
  deps.cache.set("transcript", key, t);
  return t;
}
