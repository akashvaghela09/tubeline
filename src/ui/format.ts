// Pure, width-aware text helpers for the interactive UI (unit-tested, no rendering).
import { bytes, duration, truncate, width } from "../core/style.ts";
import type { SearchResult } from "../models/search.ts";
import type { VideoSummary } from "../models/video.ts";
import type { Progress } from "../services/download.ts";
import type { Part } from "./components.tsx";
import { theme } from "./theme.ts";

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

/** 3 significant digits so a column of counts lines up: 999, 1.20K, 27.5M, 1.80B. */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, u] of units) {
    if (n >= v) {
      const x = n / v;
      return `${x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)}${u}`;
    }
  }
  return String(n);
}

export const VIDEO_COLUMNS: Column[] = [
  { width: 8, align: "right" },
  { width: 6, align: "right" },
  { width: 9 },
  { width: 0 },
];

const LEAD = 8 + 2 + 6 + 2 + 9 + 2;

function lead(a: string, b: string, c: string): string {
  return `${pad(truncate(a, 8), 8, "right")}  ${pad(truncate(b, 6), 6, "right")}  ${pad(truncate(c, 9), 9)}  `;
}

/** Channel/playlist list row: length · views · age · title. `w` = width available for text. */
export function videoParts(v: VideoSummary, w: number): Part[] {
  const tag = v.isLive ? "● LIVE " : v.isUpcoming ? "upcoming " : v.isMembersOnly ? "members " : "";
  return [
    {
      text: lead(
        duration(v.durationSeconds),
        num(v.viewCount),
        v.publishedText?.replace(/^Streamed /, "") ?? "",
      ),
      fg: theme.dim,
    },
    ...(tag ? [{ text: tag, fg: v.isLive ? theme.red : theme.yellow }] : []),
    { text: truncate(v.title, Math.max(4, w - LEAD - width(tag))) },
  ];
}

/** Search row: same columns, plus the channel in its own dim column when there's room. */
export function searchParts(r: SearchResult, w: number): Part[] {
  const room = Math.max(4, w - LEAD);
  if (r.type === "video") {
    const chanW = room >= 70 ? 22 : 0;
    const titleW = room - (chanW ? chanW + 2 : 0);
    return [
      {
        text: lead(duration(r.durationSeconds), num(r.viewCount), r.publishedText ?? ""),
        fg: theme.dim,
      },
      { text: pad(truncate(r.title, titleW), chanW ? titleW : 0) },
      ...(chanW ? [{ text: `  ${truncate(r.channel.name, chanW)}`, fg: theme.dim }] : []),
    ];
  }
  if (r.type === "channel") {
    return [
      { text: lead("channel", num(r.subscriberCount), ""), fg: theme.dim },
      { text: truncate(r.name, Math.max(4, room - 20)), fg: theme.cyan },
      { text: r.handle ? `  ${r.handle}` : "", fg: theme.dim },
    ];
  }
  return [
    {
      text: lead(
        "playlist",
        r.videoCount !== null ? `${r.videoCount}` : "",
        r.updatedText?.replace(/^(Last )?updated /i, "") ?? "",
      ),
      fg: theme.dim,
    },
    { text: truncate(r.title, Math.max(4, room - 22)), fg: theme.cyan },
    { text: r.channelName ? `  ${truncate(r.channelName, 20)}` : "", fg: theme.dim },
  ];
}

export function headerParts(search: boolean, w: number): string {
  return `${lead("length", "views", "age")}${search && w - LEAD >= 70 ? `${pad("title", w - LEAD - 24)}  channel` : "title"}`;
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
