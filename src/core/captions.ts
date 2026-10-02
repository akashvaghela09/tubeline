// Caption formats: parse YouTube srv3 XML / json3, render txt / vtt / srt.
import type { TranscriptSegment } from "../models/video.ts";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** srv3 ("timedtext format=3"): <p t="ms" d="ms">text or <s>word</s>…</p>. */
export function parseSrv3(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const m of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const attrs = m[1] as string;
    const t = Number(attrs.match(/\bt="(\d+)"/)?.[1]);
    const d = Number(attrs.match(/\bd="(\d+)"/)?.[1] ?? 0);
    if (!Number.isFinite(t)) continue;
    const text = clean(decodeEntities((m[2] as string).replace(/<[^>]+>/g, "")));
    if (!text) continue;
    segments.push({ start: t / 1000, duration: d / 1000, text });
  }
  return segments;
}

/** json3: {events:[{tStartMs,dDurationMs,segs:[{utf8}]}]} (yt-dlp's preferred subtitle format). */
export function parseJson3(json: string): TranscriptSegment[] {
  const data = JSON.parse(json) as {
    events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
  };
  const segments: TranscriptSegment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.tStartMs === undefined) continue;
    const text = clean(ev.segs.map((s) => s.utf8 ?? "").join(""));
    if (!text) continue;
    segments.push({ start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 0) / 1000, text });
  }
  return segments;
}

export const TEXT_FORMATS = ["json", "txt", "vtt", "srt"] as const;
export type TextFormat = (typeof TEXT_FORMATS)[number];

function clock(seconds: number, sep: "." | ","): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** "[1:02:03] " / "[02:03] " prefix for --timestamps. */
export function shortClock(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** End time of a cue, clipped so cues never overlap the next one (auto captions roll over). */
function cueEnd(segments: TranscriptSegment[], i: number): number {
  const seg = segments[i] as TranscriptSegment;
  const end = seg.start + seg.duration;
  const next = segments[i + 1];
  return next && next.start < end ? next.start : end;
}

export function toTxt(segments: TranscriptSegment[], timestamps = false): string {
  return (
    segments.map((s) => (timestamps ? `[${shortClock(s.start)}] ${s.text}` : s.text)).join("\n") +
    "\n"
  );
}

export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments.map(
    (s, i) => `${clock(s.start, ".")} --> ${clock(cueEnd(segments, i), ".")}\n${s.text}`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function toSrt(segments: TranscriptSegment[]): string {
  const cues = segments.map(
    (s, i) => `${i + 1}\n${clock(s.start, ",")} --> ${clock(cueEnd(segments, i), ",")}\n${s.text}`,
  );
  return `${cues.join("\n\n")}\n`;
}
