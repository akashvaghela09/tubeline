// Fixture scenarios shared by the recorder, contract tests and live tests.
import { ResponseCache } from "../../src/core/cache.ts";
import type { FetchFn } from "../../src/core/http.ts";
import { parseRef } from "../../src/core/resolve.ts";
import { getTranscript } from "../../src/services/transcript.ts";
import type {
  InnertubeSource,
  ListSort,
  ListType,
  SearchOptions,
} from "../../src/sources/innertube.ts";

export interface Scenario {
  name: string;
  run: (source: InnertubeSource, fetch: FetchFn) => Promise<unknown>;
}

async function take(
  source: InnertubeSource,
  ref: string,
  n: number,
  type: ListType = "videos",
  sort?: ListSort,
) {
  const out = [];
  for await (const item of source.listVideos(parseRef(ref), { type, sort })) {
    out.push(item);
    if (out.length >= n) break;
  }
  return out;
}

const transcript = (
  source: InnertubeSource,
  fetch: FetchFn,
  id: string,
  opts: { lang?: string; prefer?: "manual" | "auto" } = {},
) =>
  getTranscript({ source, fetch, cache: ResponseCache.disabled(), ytdlp: false }, id, {
    prefer: "manual",
    ...opts,
  });

async function search(
  source: InnertubeSource,
  query: string,
  type: SearchOptions["type"],
  n: number,
) {
  const out = [];
  for await (const item of source.search(query, { type })) {
    out.push(item);
    if (out.length >= n) break;
  }
  return out;
}

export const SCENARIOS: Scenario[] = [
  { name: "channel-mkbhd", run: (s) => s.getChannel(parseRef("@mkbhd")) },
  { name: "channel-by-id", run: (s) => s.getChannel(parseRef("UCXuqSBlHAE6Xw-yeJA0Tunw")) },
  {
    name: "channel-missing-handle",
    run: (s) => s.getChannel(parseRef("@thishandledoesnotexist-zz9q")),
  },
  { name: "video-rickroll", run: (s) => s.getVideo("dQw4w9WgXcQ") },
  { name: "video-chapters", run: (s) => s.getVideo("pOX1l1edBME") },
  { name: "video-age-restricted", run: (s) => s.getVideo("HtVdAasjOgU") },
  { name: "video-missing", run: (s) => s.getVideo("aaaaaaaaaaa") },
  // 45 items forces one continuation page (tabs return 30 per page).
  { name: "list-videos", run: (s) => take(s, "@mkbhd", 45) },
  { name: "list-shorts", run: (s) => take(s, "@mkbhd", 5, "shorts") },
  { name: "list-streams", run: (s) => take(s, "@mkbhd", 5, "streams") },
  { name: "list-popular", run: (s) => take(s, "@mkbhd", 5, "videos", "popular") },
  { name: "list-all", run: (s) => take(s, "@mkbhd", 5, "all") },
  { name: "list-playlist", run: (s) => take(s, "PLBsP89CPrMeO7uztAu6YxSB10cRMpjgiY", 100) },
  // 25 items forces one continuation page (search returns ~20 per page).
  { name: "search-videos", run: (s) => search(s, "mkbhd iphone review", "video", 25) },
  { name: "search-channels", run: (s) => search(s, "mkbhd", "channel", 3) },
  { name: "search-playlists", run: (s) => search(s, "mkbhd iphone", "playlist", 3) },
  { name: "search-shorts", run: (s) => search(s, "cat", "shorts", 3) },
  { name: "transcript-manual", run: (s, f) => transcript(s, f, "dQw4w9WgXcQ") },
  { name: "transcript-auto", run: (s, f) => transcript(s, f, "e1q-TuHdc4Y", { prefer: "auto" }) },
  { name: "transcript-other-lang", run: (s, f) => transcript(s, f, "e1q-TuHdc4Y", { lang: "ja" }) },
  {
    name: "transcript-missing-lang",
    run: (s, f) => transcript(s, f, "e1q-TuHdc4Y", { lang: "de" }),
  },
];
