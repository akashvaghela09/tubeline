// The download panel: opens filled with remembered defaults; Enter downloads, everything can
// be changed in place, and "make these my defaults" is an explicit choice.
import { useKeyboard } from "@opentui/react";
import { useReducer } from "react";
import { bytes, truncate } from "../../core/style.ts";
import type { Video } from "../../models/video.ts";
import type { AudioFormat, Quality } from "../../services/download.ts";
import { askFolder, queueMedia, type Target } from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line } from "../components.tsx";
import { tildify } from "../format.ts";
import type { Prefs } from "../prefs.ts";
import { theme } from "../theme.ts";

export interface DownloadModel {
  targets: Target[];
  /** Full metadata when downloading a single video (sizes, existing file). */
  video: Video | null;
  mode: "video" | "audio";
  field: number;
  quality: Prefs["videoQuality"];
  format: AudioFormat;
  dir: string;
  makeDefault: boolean;
}

const ALL_QUALITIES: Prefs["videoQuality"][] = [
  "best",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
];
const FORMATS: { value: AudioFormat; label: string }[] = [
  { value: "mp3", label: "mp3" },
  { value: "m4a", label: "m4a" },
  { value: "opus", label: "opus" },
];

export function newDownload(
  prefs: Prefs,
  targets: Target[],
  video: Video | null,
  mode: "video" | "audio",
): DownloadModel {
  return {
    targets,
    video,
    mode,
    field: 0,
    quality: prefs.videoQuality,
    format: prefs.audioFormat,
    dir: prefs.downloadDir,
    makeDefault: false,
  };
}

export function DownloadScreen({ model: m }: { model: DownloadModel }) {
  const ui = useUi();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const single = m.targets.length === 1;
  const v = m.video;

  const qualities = v
    ? ALL_QUALITIES.filter((q) => q === "best" || v.qualities.some((x) => x.label === q))
    : ALL_QUALITIES;
  const sizeOf = (q: Prefs["videoQuality"]) =>
    v
      ? ((q === "best" ? v.qualities[0]?.bytes : v.qualities.find((x) => x.label === q)?.bytes) ??
        null)
      : null;
  const qLabel = (q: Prefs["videoQuality"]) =>
    q === "best"
      ? `best${v?.qualities[0] ? ` (${v.qualities[0].label})` : ""}`
      : single
        ? q
        : `up to ${q}`;
  const dirs = [...new Set([m.dir, ui.prefs.downloadDir, ...ui.prefs.recentDirs])];
  const fields = m.mode === "video" ? ["quality", "dir", "default"] : ["format", "dir", "default"];
  const field = fields[Math.min(m.field, fields.length - 1)];
  const existing = single && m.targets[0] ? ui.services.existing(m.targets[0].id, m.dir) : null;
  const size = m.mode === "video" ? sizeOf(m.quality) : null;

  const cycle = <T,>(list: T[], current: T, d: number): T =>
    list[(list.indexOf(current) + d + list.length) % list.length] as T;

  const start = () => {
    if (m.makeDefault) {
      if (m.mode === "video") ui.prefs.videoQuality = m.quality;
      else ui.prefs.audioFormat = m.format;
      ui.prefs.downloadDir = m.dir;
      ui.savePrefs();
    }
    ui.pop();
    queueMedia(ui, m.targets, m.mode, {
      quality: m.quality as Quality,
      format: m.format,
      dir: m.dir,
    });
  };

  useKeys([
    ["Enter", "download"],
    ["↑↓", "field"],
    ["←→", "change"],
    ["Tab", "video/audio"],
    ["e", "type a folder"],
    ["space", "defaults"],
    ["Esc", "cancel"],
  ]);

  useKeyboard((k) => {
    if (k.ctrl || k.meta) return;
    if (k.name === "escape" || k.name === "backspace") return ui.pop();
    if (k.name === "return") return start();
    if (k.name === "tab") {
      m.mode = m.mode === "video" ? "audio" : "video";
      m.field = 0;
    } else if (k.name === "up") m.field = Math.max(0, m.field - 1);
    else if (k.name === "down") m.field = Math.min(fields.length - 1, m.field + 1);
    else if (k.name === "left" || k.name === "right") {
      const d = k.name === "right" ? 1 : -1;
      if (field === "quality") m.quality = cycle(qualities, m.quality, d);
      if (field === "format")
        m.format = cycle(
          FORMATS.map((f) => f.value),
          m.format,
          d,
        );
      if (field === "dir") m.dir = cycle(dirs, m.dir, d);
      if (field === "default") m.makeDefault = !m.makeDefault;
    } else if (k.name === "space") m.makeDefault = !m.makeDefault;
    else if (k.name === "e") {
      return askFolder(ui, "Save to", m.dir, (dir) => {
        m.dir = dir;
      });
    }
    redraw();
  });

  const row = (name: string, label: string, value: string, extra = "") => {
    const focused = field === name;
    return (
      <text wrapMode="none" truncate bg={focused ? theme.cursorBg : undefined}>
        <span fg={focused ? theme.accent : theme.faint}>{focused ? " ▸ " : "   "}</span>
        <span fg={theme.dim}>{label.padEnd(10)}</span>
        <span fg={focused ? theme.accent : theme.faint}>{focused ? "‹ " : "  "}</span>
        <span fg={theme.fg}>
          <strong>{value}</strong>
        </span>
        <span fg={focused ? theme.accent : theme.faint}>{focused ? " ›" : "  "}</span>
        <span fg={theme.dim}>{`   ${extra}`}</span>
        <span>{" ".repeat(Math.max(0, ui.width - 30 - value.length - extra.length))}</span>
      </text>
    );
  };

  const title = single ? (m.targets[0]?.title ?? "") : `${m.targets.length} videos`;
  return (
    <box flexDirection="column">
      <Blank />
      <text wrapMode="none" truncate>
        <span fg={theme.fg}>
          <strong>{`Download ${truncate(title, Math.max(10, ui.width - 30))}`}</strong>
        </span>
        <span fg={theme.dim}>{"   "}</span>
        <span fg={m.mode === "video" ? theme.accent : theme.dim}>
          {m.mode === "video" ? "[video]" : " video "}
        </span>
        <span fg={m.mode === "audio" ? theme.accent : theme.dim}>
          {m.mode === "audio" ? "[audio]" : " audio "}
        </span>
        <span fg={theme.faint}> Tab</span>
      </text>
      <Blank />
      {m.mode === "video"
        ? row(
            "quality",
            "Quality",
            qLabel(m.quality),
            `${sizeOf(m.quality) ? `≈ ${bytes(sizeOf(m.quality) as number)}   ` : ""}${qualities.map((q) => (q === m.quality ? `[${q}]` : q)).join(" ")}`,
          )
        : row(
            "format",
            "Format",
            m.format,
            FORMATS.map((f) => (f.value === m.format ? `[${f.label}]` : f.label)).join(" "),
          )}
      {row(
        "dir",
        "Save to",
        tildify(m.dir),
        dirs.length > 1
          ? `${dirs.indexOf(m.dir) + 1}/${dirs.length} recent · e type a path`
          : "e type a path",
      )}
      {row(
        "default",
        "Defaults",
        m.makeDefault ? "[x] make these my defaults" : "[ ] make these my defaults",
      )}
      <Blank />
      {existing ? (
        <Line
          fg={theme.yellow}
        >{`   ! Already in ${tildify(m.dir)} — this downloads it again.`}</Line>
      ) : null}
      <text wrapMode="none">
        <span fg={theme.dim}>{"   "}</span>
        <span fg={theme.green}>
          <strong>{`▶ Enter  download${single ? "" : ` ${m.targets.length} videos`}${size ? ` (≈ ${bytes(size)})` : ""}`}</strong>
        </span>
      </text>
    </box>
  );
}
