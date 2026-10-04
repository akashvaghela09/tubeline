// Readable renderings of each output shape for --format human (the default at a terminal).
import type { Channel } from "../models/channel.ts";
import type { SearchResult } from "../models/search.ts";
import type { Transcript, Video, VideoSummary } from "../models/video.ts";
import { shortClock } from "./captions.ts";
import { bytes, c, columns, compact, duration, truncate } from "./style.ts";

const sep = c.dim(" · ");
const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(sep);

function blocks(items: unknown[], one: (item: never) => string): string {
  return `${items.map((i) => one(i as never).trimEnd()).join(`\n\n${c.dim("─".repeat(40))}\n\n`)}\n`;
}

function date(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function description(text: string, maxLines: number): string {
  const lines = text.trim().split("\n");
  const shown = lines.slice(0, maxLines).join("\n");
  return lines.length > maxLines
    ? `${shown}\n${c.dim(`… ${lines.length - maxLines} more lines (--json for all)`)}`
    : shown;
}

export function channelHuman(items: unknown[]): string {
  return blocks(items, (ch: Channel) => {
    const lines = [
      `${c.bold(ch.name)}${ch.isVerified ? ` ${c.cyan("✓")}` : ""}  ${c.dim(ch.handle ?? "")}`,
      join([
        ch.subscriberCount !== null && `${compact(ch.subscriberCount)} subscribers`,
        ch.videoCount !== null && `${ch.videoCount.toLocaleString("en-US")} videos`,
        ch.viewCount !== null && `${compact(ch.viewCount)} views`,
        ch.joinedAt && `joined ${ch.joinedAt}`,
        ch.country,
      ]),
      c.cyan(ch.url),
    ];
    if (ch.description) lines.push("", description(ch.description, 6));
    if (ch.links.length) lines.push("", ...ch.links.map((l) => `${c.dim(`${l.title}:`)} ${l.url}`));
    return lines.join("\n");
  });
}

export function videoHuman(items: unknown[]): string {
  return blocks(items, (v: Video) => {
    const lines = [
      c.bold(v.title),
      join([
        `${v.channel.name}${v.channel.isVerified ? ` ${c.cyan("✓")}` : ""}`,
        v.channel.handle,
        v.channel.subscriberCount !== null && `${compact(v.channel.subscriberCount)} subscribers`,
      ]),
      join([
        `${compact(v.viewCount)} views`,
        v.likeCount !== null && `${compact(v.likeCount)} likes`,
        v.commentCount !== null && `${compact(v.commentCount)} comments`,
        duration(v.durationSeconds),
        date(v.publishedAt) && `published ${date(v.publishedAt)}`,
      ]),
      c.cyan(v.url),
    ];
    if (v.isLive) lines.push(c.red("● LIVE now"));
    if (v.playability.status !== "OK") {
      lines.push(
        c.yellow(
          `⚠ ${v.playability.status}${v.playability.reason ? `: ${v.playability.reason}` : ""}`,
        ),
      );
    }
    if (v.captions.length) {
      const langs = [...new Set(v.captions.map((t) => (t.isAuto ? `${t.lang} (auto)` : t.lang)))];
      lines.push(`${c.dim("Captions:")} ${langs.join(", ")}`);
    }
    if (v.chapters.length) {
      lines.push(
        "",
        c.dim("Chapters:"),
        ...v.chapters.map(
          (ch) => `  ${c.dim(shortClock(ch.startSeconds).padStart(7))}  ${ch.title}`,
        ),
      );
    }
    if (v.description) lines.push("", description(v.description, 8));
    return lines.join("\n");
  });
}

export function videoListHuman(items: unknown[]): string {
  const list = items as VideoSummary[];
  if (!list.length) return `${c.dim("No videos.")}\n`;
  const rows = list.map((v, i) => [
    c.dim(String(i + 1)),
    truncate(v.title, 60) +
      (v.isLive ? ` ${c.red("LIVE")}` : "") +
      (v.isUpcoming ? ` ${c.yellow("UPCOMING")}` : ""),
    compact(v.viewCount),
    v.publishedText ?? "–",
    duration(v.durationSeconds),
    c.dim(v.id),
  ]);
  return columns(rows, ["#", "title", "views", "published", "length", "id"]);
}

export function searchHuman(items: unknown[]): string {
  const list = items as SearchResult[];
  if (!list.length) return `${c.dim("No results.")}\n`;
  const rows = list.map((r, i) => {
    const n = c.dim(String(i + 1));
    if (r.type === "video") {
      return [
        n,
        c.dim("video"),
        truncate(r.title, 55),
        truncate(r.channel.name, 22),
        `${compact(r.viewCount)} views`,
        r.publishedText ?? "",
        duration(r.durationSeconds),
        c.dim(r.id),
      ];
    }
    if (r.type === "channel") {
      return [
        n,
        c.dim("channel"),
        truncate(r.name, 55),
        r.handle ?? "",
        `${compact(r.subscriberCount)} subs`,
        "",
        "",
        c.dim(r.id),
      ];
    }
    return [
      n,
      c.dim("playlist"),
      truncate(r.title, 55),
      truncate(r.channelName ?? "", 22),
      r.videoCount !== null ? `${r.videoCount} videos` : "",
      r.updatedText ?? "",
      "",
      c.dim(r.id),
    ];
  });
  return columns(rows);
}

export function transcriptHuman(items: unknown[]): string {
  return blocks(items, (t: Transcript) => {
    const head = c.dim(
      `${t.videoId} · ${t.name ?? t.lang}${t.isTranslated ? " (translated)" : ""} · ${t.segments.length} lines`,
    );
    return [head, ...t.segments.map((s) => `${c.dim(`[${shortClock(s.start)}]`)} ${s.text}`)].join(
      "\n",
    );
  });
}

/** For commands that write files: one "✓ Saved …" line each. */
export function savedHuman(describe: (item: Record<string, unknown>) => string) {
  return (items: unknown[]) =>
    `${items.map((i) => `${c.green("✓")} ${describe(i as Record<string, unknown>)}`).join("\n")}\n`;
}

export const thumbnailHuman = savedHuman((t) =>
  t.path
    ? `Saved ${t.path} ${c.dim(`(${t.quality}, ${t.width}×${t.height}, ${bytes(t.sizeBytes as number)})`)}`
    : `${t.url} ${c.dim(`(${t.quality}, ${t.width}×${t.height})`)}`,
);

export const downloadHuman = savedHuman(
  (d) => `Saved ${d.path} ${c.dim(`(${d.resolution}, ${bytes(d.sizeBytes as number)})`)}`,
);

export const transcriptFileHuman = savedHuman((f) => `Saved ${f.path} ${c.dim(`(${f.lang})`)}`);

export function trackListHuman(items: unknown[]): string {
  return blocks(
    items,
    (l: { videoId: string; tracks: { lang: string; name: string; isAuto: boolean }[] }) => {
      if (!l.tracks.length) return `${l.videoId}: ${c.dim("no captions")}`;
      return [
        c.dim(`${l.videoId} — ${l.tracks.length} caption tracks`),
        columns(
          l.tracks.map((t) => [t.lang, t.name, t.isAuto ? c.dim("auto") : "manual"]),
        ).trimEnd(),
      ].join("\n");
    },
  );
}

interface CheckLike {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
  hint: string | null;
}

export function doctorHuman(items: unknown[]): string {
  const report = items[0] as {
    ok: boolean;
    version: string;
    platform: string;
    checks: CheckLike[];
  };
  const rows = report.checks.map((ch) => [
    ch.ok ? c.green("✓") : ch.required ? c.red("✗") : c.yellow("!"),
    ch.name,
    truncate(ch.detail, 80) + (ch.hint ? `\n${" ".repeat(4)}${c.dim(`→ ${ch.hint}`)}` : ""),
  ]);
  const lines = rows.map(
    ([mark, name, detail]) => `${mark} ${(name as string).padEnd(20)} ${detail}`,
  );
  const verdict = report.ok
    ? c.green("All required checks passed.")
    : c.red("Some required checks failed.");
  return `${c.dim(`tubeline ${report.version} (${report.platform})`)}\n${lines.join("\n")}\n\n${verdict}\n`;
}

function describeUpdate(name: string, r: Record<string, unknown> | undefined): string | null {
  if (!r) return null;
  if ("updateAvailable" in r) {
    const current = (r.current ??
      (r.managed as { version?: string } | undefined)?.version ??
      "not installed") as string;
    const latest = (r.latest ?? "unknown") as string;
    return r.updateAvailable
      ? `${c.yellow("↑")} ${name}: ${current} → ${latest} available`
      : `${c.green("✓")} ${name}: ${current} is current`;
  }
  switch (r.action) {
    case "installed":
      return `${c.green("✓")} ${name}: installed ${r.to} ${c.dim(`at ${r.path}`)}`;
    case "updated":
      return `${c.green("✓")} ${name}: updated ${r.from} → ${r.to}`;
    case "current":
      return `${c.green("✓")} ${name}: ${r.to ?? r.from} is already the latest${r.reason ? c.dim(` (${r.reason})`) : ""}`;
    case "skipped":
      return `${c.dim("–")} ${name}: skipped — ${r.reason}`;
    default:
      return `${c.red("✗")} ${name}: ${r.message ?? "failed"}${r.hint ? `\n    ${c.dim(`→ ${r.hint}`)}` : ""}`;
  }
}

export function updateHuman(items: unknown[]): string {
  const r = items[0] as { self?: Record<string, unknown>; ytDlp?: Record<string, unknown> };
  const lines = [describeUpdate("tubeline", r.self), describeUpdate("yt-dlp", r.ytDlp)].filter(
    Boolean,
  );
  const sys = r.ytDlp?.systemYtDlp as
    | { path: string; version: string; upgrade: string }
    | undefined;
  if (sys)
    lines.push(
      c.dim(
        `  (system yt-dlp ${sys.version} at ${sys.path} is no longer used; to upgrade it: ${sys.upgrade})`,
      ),
    );
  return `${lines.join("\n")}\n`;
}
