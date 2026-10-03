// Fake services for UI tests: deterministic data, no network, controllable downloads.
import type { Channel } from "../../src/models/channel.ts";
import type { SearchResult } from "../../src/models/search.ts";
import type { Transcript, Video, VideoSummary } from "../../src/models/video.ts";
import type { DownloadResult, Progress } from "../../src/services/download.ts";
import type { DownloadSpec, UiServices } from "../../src/ui/services.ts";

export function video(id: string, title: string): Video {
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title,
    description: "A description line.\nSecond line.",
    durationSeconds: 213,
    viewCount: 1_800_000_000,
    likeCount: 19_000_000,
    commentCount: 2_400_000,
    commentCountText: "2.4M",
    publishedAt: "2009-10-25T06:57:33.000Z",
    uploadedAt: "2009-10-25T06:57:33.000Z",
    channel: {
      id: "UC1",
      name: "Rick Astley",
      handle: "@RickAstleyYT",
      url: "https://www.youtube.com/channel/UC1",
      subscriberCount: 4_500_000,
      subscriberCountText: "4.5M",
      isVerified: true,
    },
    category: "Music",
    keywords: [],
    isLive: false,
    isLiveContent: false,
    isUpcoming: false,
    isUnlisted: false,
    isFamilySafe: true,
    thumbnails: [],
    captions: [
      { lang: "en", name: "English", isAuto: false, isTranslatable: true },
      { lang: "de", name: "German", isAuto: false, isTranslatable: true },
    ],
    chapters: [],
    qualities: [
      { label: "1080p", bytes: 34_000_000 },
      { label: "720p", bytes: 21_000_000 },
      { label: "360p", bytes: 9_000_000 },
    ],
    playability: { status: "OK", reason: null },
  };
}

export function summary(i: number): VideoSummary {
  return {
    id: `vid${String(i).padStart(8, "0")}`,
    url: `https://www.youtube.com/watch?v=vid${i}`,
    title: `Video number ${i}`,
    type: "video",
    durationSeconds: 60 + i,
    viewCount: 1000 * i,
    viewCountText: null,
    publishedText: `${i}d ago`,
    publishedAtApprox: null,
    isLive: false,
    isUpcoming: false,
    isMembersOnly: false,
    thumbnail: null,
    channelName: null,
  };
}

export interface FakeLog {
  downloads: { id: string; spec: DownloadSpec }[];
  transcripts: { id: string; format: string; dir: string }[];
  thumbnails: string[];
  searches: { query: string; type: string }[];
  opened: string[];
}

export function fakeServices(
  opts: { downloadStep?: (emit: (p: Progress) => void) => Promise<void> } = {},
) {
  const log: FakeLog = { downloads: [], transcripts: [], thumbnails: [], searches: [], opened: [] };
  const services: UiServices = {
    version: "9.9.9",
    async getVideo(id) {
      log.opened.push(id);
      return video(id, id === "dQw4w9WgXcQ" ? "Never Gonna Give You Up" : `Video ${id}`);
    },
    async getChannel() {
      return {
        id: "UC1",
        name: "Fake Channel",
        handle: "@fake",
        subscriberCount: 1000,
        isVerified: true,
      } as unknown as Channel;
    },
    async *listVideos() {
      for (let i = 1; i <= 75; i++) yield summary(i);
    },
    async *search(query, type) {
      log.searches.push({ query, type });
      const r: SearchResult = {
        ...summary(1),
        type: "video",
        channel: { id: "UC1", name: "Fake", handle: null, isVerified: false },
        isShort: false,
        description: "",
      } as unknown as SearchResult;
      yield r;
    },
    async getTranscript(id, lang) {
      return {
        videoId: id,
        lang: lang ?? "en",
        name: lang === "de" ? "German" : "English",
        isAuto: false,
        isTranslated: false,
        source: "innertube",
        segments: [
          { start: 1, duration: 2, text: "first line" },
          { start: 18, duration: 3, text: "second line" },
        ],
      } satisfies Transcript;
    },
    saveTranscript(t, _title, format, dir) {
      log.transcripts.push({ id: t.videoId, format, dir });
      return `${dir}/${t.videoId}.${format}`;
    },
    async thumbnail(id, dir) {
      log.thumbnails.push(id);
      return `${dir}/${id}.jpg`;
    },
    async download(id, spec, onProgress) {
      log.downloads.push({ id, spec });
      await opts.downloadStep?.(onProgress);
      return {
        id,
        title: "t",
        path: `${spec.dir}/${id}.mp4`,
        ext: "mp4",
        formatId: "18",
        resolution: "640x360",
        sizeBytes: 1000,
      } satisfies DownloadResult;
    },
    existing: () => null,
    update: async () => "✓ yt-data: 9.9.9 is already the latest\n",
    doctor: async () => "All required checks passed.\n",
    ytDlpAge: async () => 10,
  };
  return { services, log };
}
