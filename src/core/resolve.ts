// Parse user input (URL, @handle, id) into a typed reference. Pure — no network.
import { CliError } from "./errors.ts";

export type Ref =
  | { kind: "video"; id: string }
  | { kind: "channel"; id: string }
  /** Needs a network lookup to become a channel id (handle, /c/name, /user/name). */
  | { kind: "channelUrl"; url: string }
  | { kind: "playlist"; id: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const PLAYLIST_ID = /^(PL|UU|LL|FL|OLAK5uy_|RD|UL|OL)[A-Za-z0-9_-]{8,}$/;
const HANDLE = /^@[\p{L}\p{N}._-]{1,100}$/u;

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseRef(input: string): Ref {
  const raw = input.trim();
  if (!raw) throw usage(input);

  if (HANDLE.test(raw)) return { kind: "channelUrl", url: `https://www.youtube.com/${raw}` };
  if (CHANNEL_ID.test(raw)) return { kind: "channel", id: raw };
  if (VIDEO_ID.test(raw)) return { kind: "video", id: raw };
  if (PLAYLIST_ID.test(raw)) return { kind: "playlist", id: raw };

  const url = toUrl(raw);
  if (!url) throw usage(input);
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    if (VIDEO_ID.test(id)) return { kind: "video", id };
    throw usage(input);
  }
  if (!YT_HOSTS.has(host)) throw usage(input, "Only youtube.com and youtu.be URLs are supported");

  const segments = url.pathname.split("/").filter(Boolean);
  const [first = "", second = ""] = segments;

  const v = url.searchParams.get("v");
  if (first === "watch" && v && VIDEO_ID.test(v)) return { kind: "video", id: v };
  if (["shorts", "live", "embed", "v", "e"].includes(first) && VIDEO_ID.test(second)) {
    return { kind: "video", id: second };
  }

  const list = url.searchParams.get("list");
  if (first === "playlist" && list && PLAYLIST_ID.test(list)) return { kind: "playlist", id: list };

  if (first === "channel" && CHANNEL_ID.test(second)) return { kind: "channel", id: second };
  if (first.startsWith("@") && HANDLE.test(decodeURIComponent(first))) {
    return { kind: "channelUrl", url: `https://www.youtube.com/${first}` };
  }
  if ((first === "c" || first === "user") && second) {
    return { kind: "channelUrl", url: `https://www.youtube.com/${first}/${second}` };
  }

  throw usage(input);
}

function toUrl(raw: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

function usage(input: string, hint?: string): CliError {
  return new CliError(
    "USAGE",
    `Cannot parse "${input}" as a YouTube reference`,
    hint ??
      "Pass a youtube.com/youtu.be URL, @handle, UC… channel id, 11-char video id or PL… playlist id",
  );
}

/** Human-readable kind for messages ("channelUrl" is an implementation detail). */
export function refKindLabel(ref: Ref): string {
  return ref.kind === "channelUrl" ? "channel" : ref.kind;
}

export function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function channelUrl(id: string): string {
  return `https://www.youtube.com/channel/${id}`;
}
