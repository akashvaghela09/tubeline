// Remembered defaults: folders, quality and formats.
import { useKeyboard } from "@opentui/react";
import { useReducer, useState } from "react";
import { askFolder, TRANSCRIPT_FORMATS } from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { pad, tildify } from "../format.ts";
import type { Prefs } from "../prefs.ts";

type FolderKey = "downloadDir" | "transcriptDir" | "thumbnailDir";

export function SettingsScreen({ model }: { model: { cursor: number } }) {
  const ui = useUi();
  const [cursor, setCursorState] = useState(model.cursor);
  const setCursor = (f: (c: number) => number) =>
    setCursorState((c) => {
      model.cursor = f(c);
      return model.cursor;
    });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const p = ui.prefs;
  const save = () => {
    ui.savePrefs();
    redraw();
  };
  const folder = (key: FolderKey, label: string) => () =>
    askFolder(ui, label, p[key], (dir) => {
      p[key] = dir;
      save();
    });

  const rows: { key: string; label: string; value: string; edit: () => void }[] = [
    {
      key: "dl",
      label: "Download folder",
      value: tildify(p.downloadDir),
      edit: folder("downloadDir", "Download folder"),
    },
    {
      key: "q",
      label: "Video quality",
      value: p.videoQuality,
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default video quality",
          options: ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"].map((q) => ({
            value: q,
            label: q === "best" ? "Best available" : `Up to ${q}`,
          })),
          onPick: (q) => {
            p.videoQuality = q as Prefs["videoQuality"];
            save();
          },
        }),
    },
    {
      key: "af",
      label: "Audio format",
      value: p.audioFormat,
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default audio format",
          options: [
            { value: "mp3", label: "MP3" },
            { value: "m4a", label: "M4A (AAC)" },
            { value: "opus", label: "Opus" },
          ],
          onPick: (f) => {
            p.audioFormat = f as Prefs["audioFormat"];
            save();
          },
        }),
    },
    {
      key: "tf",
      label: "Transcript format",
      value:
        TRANSCRIPT_FORMATS.find((f) => f.value === p.transcriptFormat)?.label ?? p.transcriptFormat,
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default transcript format",
          options: TRANSCRIPT_FORMATS,
          onPick: (f) => {
            p.transcriptFormat = f as Prefs["transcriptFormat"];
            save();
          },
        }),
    },
    {
      key: "td",
      label: "Transcript folder",
      value: tildify(p.transcriptDir),
      edit: folder("transcriptDir", "Transcript folder"),
    },
    {
      key: "th",
      label: "Thumbnail folder",
      value: tildify(p.thumbnailDir),
      edit: folder("thumbnailDir", "Thumbnail folder"),
    },
    {
      key: "clear",
      label: "Clear recent items",
      value: `${p.recent.length}`,
      edit: () => {
        p.recent = [];
        save();
        ui.toast("Recent items cleared", "ok");
      },
    },
  ];

  useKeys([
    ["Enter", "change"],
    ["↑↓", "move"],
    ["^U", "update"],
    ["^K", "check setup"],
    ["Esc", "back"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape") return ui.pop();
    if (key.name === "up") setCursor((c) => Math.max(0, c - 1));
    if (key.name === "down") setCursor((c) => Math.min(rows.length - 1, c + 1));
    if (key.name === "return") rows[cursor]?.edit();
  });

  return (
    <box flexDirection="column">
      <Blank />
      <Line bold>Settings</Line>
      <Blank />
      <List
        rows={rows.map((r) => ({ key: r.key, text: `${pad(r.label, 20)} ${r.value}` }))}
        cursor={cursor}
        height={rows.length}
      />
    </box>
  );
}
