// Pure, width-aware text helpers for the interactive UI (unit-tested, no rendering).
import { bytes, compact, duration, truncate, width } from "../core/style.ts";
import type { SearchResult } from "../models/search.ts";
import type { VideoSummary } from "../models/video.ts";
import type { Progress } from "../services/download.ts";

export function pad(s: string, w: number, align: "left" | "right" = "left"): string {
  const gap = Math.max(0, w - width(s));
  return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

export function fit(s: string, w: number): string {
  return w <= 0 ? "" : pad(truncate(s, w), w);
}

/** "3.1 MB/s"; null → "". */
export function rate(bps: number | null): string {
  return bps === null ? "" : `${bytes(bps)}/s`;
}

export function clock(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function bar(percent: number, w: number): string {
  const cells = Math.max(0, w);
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * cells;
  const full = Math.floor(filled);
  const half = filled - full >= 0.5 && full < cells ? "╸" : "";
  return `${"━".repeat(full)}${half}${"─".repeat(Math.max(0, cells - full - (half ? 1 : 0)))}`;
}

export function stageLabel(p: Progress, kind: "video" | "audio"): string {
  switch (p.stage) {
    case "preparing":
      return "fetching formats";
    case "downloading":
      return p.streams > 1
        ? `${p.stream === 1 ? "video" : "audio"} ${p.stream}/${p.streams}`
        : kind;
    case "merging":
      return "merging";
    case "converting":
      return kind === "audio" ? "converting" : "processing";
    case "done":
      return "done";
  }
}

/**
 * One progress line, numbers first and the title last, truncated to fit:
 * " 42% ━━━━━╸──── 4.2/10 MB  2.1 MB/s  ETA 0:05  video 1/2  Rick Astley – Never…"
 */
export function progressLine(
  p: Progress,
  kind: "video" | "audio",
  title: string,
  cols: number,
): string {
  const pct = `${String(Math.floor(p.percent)).padStart(3)}%`;
  const size =
    p.totalBytes !== null && p.stage === "downloading"
      ? `${bytes(p.downloadedBytes ?? 0)}/${bytes(p.totalBytes)}`
      : "";
  const eta = p.stage === "downloading" && p.eta !== null ? `ETA ${clock(p.eta)}` : "";
  const nums = [size, p.stage === "downloading" ? rate(p.speed) : "", eta, stageLabel(p, kind)]
    .filter(Boolean)
    .join("  ");
  const barWidth = Math.max(8, Math.min(30, Math.floor(cols / 5)));
  const head = `${pct} ${bar(p.percent, barWidth)}  ${nums}  `;
  return head + truncate(title, Math.max(4, cols - width(head)));
}

export interface Column {
  width: number;
  align?: "left" | "right";
}

/** Lay out cells into fixed columns; the last column takes the remaining width. */
export function row(cells: string[], columns: Column[], total: number): string {
  const fixed = columns.slice(0, -1).reduce((a, c) => a + c.width + 2, 0);
  return cells
    .map((cell, i) => {
      const col = columns[i] ?? { width: 0 };
      const w = i === columns.length - 1 ? Math.max(4, total - fixed) : col.width;
      return i === columns.length - 1 ? truncate(cell, w) : pad(truncate(cell, w), w, col.align);
    })
    .join("  ");
}

export const VIDEO_COLUMNS: Column[] = [
  { width: 8, align: "right" },
  { width: 6, align: "right" },
  { width: 9 },
  { width: 0 },
];

export function videoCells(v: VideoSummary): string[] {
  const tag = v.isLive
    ? " ● LIVE"
    : v.isUpcoming
      ? " (upcoming)"
      : v.isMembersOnly
        ? " (members)"
        : "";
  return [
    duration(v.durationSeconds),
    compact(v.viewCount),
    v.publishedText?.replace(/^Streamed /, "") ?? "",
    v.title + tag,
  ];
}

export function searchCells(r: SearchResult): string[] {
  if (r.type === "video") {
    return [
      duration(r.durationSeconds),
      compact(r.viewCount),
      r.publishedText ?? "",
      `${r.title}  · ${r.channel.name}`,
    ];
  }
  if (r.type === "channel") {
    return ["channel", compact(r.subscriberCount), "", `${r.name}  ${r.handle ?? ""}`];
  }
  return [
    "playlist",
    r.videoCount !== null ? String(r.videoCount) : "",
    "",
    `${r.title}${r.channelName ? `  · ${r.channelName}` : ""}`,
  ];
}

/** Word-wrap plain text to a width (long words are hard-split). */
export function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      let rest = word;
      while (width(rest) > w) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(rest.slice(0, w));
        rest = rest.slice(w);
      }
      if (!line) line = rest;
      else if (width(`${line} ${rest}`) <= w) line += ` ${rest}`;
      else {
        out.push(line);
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

/** "~/Downloads" for paths under home. */
export function tildify(path: string, home = process.env.HOME ?? ""): string {
  return home && (path === home || path.startsWith(`${home}/`))
    ? `~${path.slice(home.length)}`
    : path;
}
