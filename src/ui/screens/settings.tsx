// Settings, grouped: appearance, downloads, transcripts & thumbnails, maintenance.
import { useKeyboard } from "@opentui/react";
import { useReducer, useState } from "react";
import { askFolder, TRANSCRIPT_FORMATS } from "../actions.ts";
import { actions as appActions, useKeys, useUi } from "../app.tsx";
import { Blank, Line, List, type ListRow } from "../components.tsx";
import { pad, tildify } from "../format.ts";
import type { Prefs } from "../prefs.ts";
import {
  normalizeTheme,
  type Palette,
  resolveTheme,
  THEMES,
  type ThemeChoice,
  type ThemeName,
  theme,
} from "../theme.ts";

type FolderKey = "downloadDir" | "transcriptDir" | "thumbnailDir";

interface Row {
  key: string;
  group: string;
  label: string;
  value: string;
  help: string;
  edit: () => void;
}

const swatch = (t: Palette) => [t.bg, t.fg, t.accent, t.green, t.yellow, t.red];

export function SettingsScreen({ model }: { model: { cursor: number } }) {
  const ui = useUi();
  const [cursor, setCursorState] = useState(model.cursor);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const setCursor = (c: number) => {
    model.cursor = c;
    setCursorState(c);
  };
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

  const choice = normalizeTheme(p.theme);
  const resolved = resolveTheme(choice, ui.terminalMode);
  const themeLabel = choice === "auto" ? `Auto (${THEMES[resolved].label})` : THEMES[choice].label;

  const pickTheme = () => {
    const names = Object.keys(THEMES) as ThemeName[];
    const main = names.filter((n) => !(THEMES[n] as Palette).more);
    const more = names.filter((n) => (THEMES[n] as Palette).more);
    const options = [
      {
        value: "auto",
        label: "Auto",
        hint: `matches your terminal (now: ${THEMES[resolveTheme("auto", ui.terminalMode)].label})`,
      },
      ...main.map((n) => ({
        value: n,
        label: THEMES[n].label,
        swatch: swatch(THEMES[n]),
        hint: THEMES[n].light ? "light" : "dark",
      })),
      ...more.map((n, i) => ({
        value: n,
        label: THEMES[n].label,
        swatch: swatch(THEMES[n]),
        hint: THEMES[n].light ? "light" : "dark",
        group: i === 0 ? "More" : undefined,
      })),
    ];
    ui.push({
      kind: "choice",
      title: "Theme — previews as you move · Enter keeps it · Esc restores",
      options,
      initial: Math.max(
        0,
        options.findIndex((o) => o.value === choice),
      ),
      onHover: (n) => ui.setTheme(n as ThemeChoice, false),
      onCancel: () => ui.setTheme(choice, false),
      onPick: (n) => {
        ui.setTheme(n as ThemeChoice, true);
        redraw();
      },
    });
  };

  const rows: Row[] = [
    {
      key: "theme",
      group: "Appearance",
      label: "Theme",
      value: themeLabel,
      help: "Colours for the whole app. Auto follows your terminal's light or dark background.",
      edit: pickTheme,
    },
    {
      key: "dl",
      group: "Downloads",
      label: "Folder",
      value: tildify(p.downloadDir),
      help: "Where videos and audio are saved. You can still change it per download.",
      edit: folder("downloadDir", "Download folder"),
    },
    {
      key: "q",
      group: "Downloads",
      label: "Video quality",
      value: p.videoQuality === "best" ? "best available" : `up to ${p.videoQuality}`,
      help: "Default quality in the download panel. Higher quality means bigger files.",
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default video quality",
          options: ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"].map((q) => ({
            value: q,
            label: q === "best" ? "Best available" : `Up to ${q}`,
          })),
          initial: ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"].indexOf(
            p.videoQuality,
          ),
          onPick: (q) => {
            p.videoQuality = q as Prefs["videoQuality"];
            save();
          },
        }),
    },
    {
      key: "af",
      group: "Downloads",
      label: "Audio format",
      value: p.audioFormat,
      help: "mp3 plays everywhere · m4a keeps the original audio · opus is smallest.",
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default audio format",
          options: [
            { value: "mp3", label: "MP3", hint: "plays everywhere" },
            { value: "m4a", label: "M4A (AAC)", hint: "original audio, no re-encoding" },
            { value: "opus", label: "Opus", hint: "smallest files" },
          ],
          initial: ["mp3", "m4a", "opus"].indexOf(p.audioFormat),
          onPick: (f) => {
            p.audioFormat = f as Prefs["audioFormat"];
            save();
          },
        }),
    },
    {
      key: "tf",
      group: "Transcripts & thumbnails",
      label: "Transcript format",
      value:
        TRANSCRIPT_FORMATS.find((f) => f.value === p.transcriptFormat)?.label ?? p.transcriptFormat,
      help: "Used when you press s on a transcript, or t on a list.",
      edit: () =>
        ui.push({
          kind: "choice",
          title: "Default transcript format",
          options: TRANSCRIPT_FORMATS,
          initial: Math.max(
            0,
            TRANSCRIPT_FORMATS.findIndex((f) => f.value === p.transcriptFormat),
          ),
          onPick: (f) => {
            p.transcriptFormat = f as Prefs["transcriptFormat"];
            save();
          },
        }),
    },
    {
      key: "td",
      group: "Transcripts & thumbnails",
      label: "Transcript folder",
      value: tildify(p.transcriptDir),
      help: "Where transcripts are saved.",
      edit: folder("transcriptDir", "Transcript folder"),
    },
    {
      key: "th",
      group: "Transcripts & thumbnails",
      label: "Thumbnail folder",
      value: tildify(p.thumbnailDir),
      help: "Where thumbnails are saved.",
      edit: folder("thumbnailDir", "Thumbnail folder"),
    },
    {
      key: "check",
      group: "Maintenance",
      label: "Check setup",
      value: "run  (^K)",
      help: "Checks the downloader, ffmpeg and that YouTube answers.",
      edit: () => appActions.checkSetup(ui),
    },
    {
      key: "update",
      group: "Maintenance",
      label: "Update",
      value: "yt-data and yt-dlp  (^U)",
      help: "Downloads the latest yt-data and yt-dlp (the downloader YouTube changes often break).",
      edit: () => appActions.updateAll(ui),
    },
    {
      key: "recent",
      group: "Maintenance",
      label: "Recent items",
      value: `${p.recent.length} saved  (Enter clears)`,
      help: "The links and searches listed on Home.",
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
    ["Esc", "back"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape" || key.name === "backspace") return ui.pop();
    if (key.name === "up") setCursor(Math.max(0, cursor - 1));
    if (key.name === "down") setCursor(Math.min(rows.length - 1, cursor + 1));
    if (key.name === "return") rows[cursor]?.edit();
  });

  // Group headers are display-only rows; map the cursor onto real rows.
  const display: ListRow[] = [];
  const indexOf: number[] = [];
  let last = "";
  rows.forEach((r, i) => {
    if (r.group !== last) {
      if (last) display.push({ key: `gap-${r.key}`, text: "" });
      display.push({
        key: `g-${r.key}`,
        parts: [{ text: r.group, fg: theme.accent2, bold: true }],
      });
      last = r.group;
    }
    indexOf[i] = display.length;
    display.push({
      key: r.key,
      parts: [{ text: `  ${pad(r.label, 20)}` }, { text: r.value, fg: theme.dim }],
    });
  });

  return (
    <box flexDirection="column">
      <Blank />
      <List
        rows={display}
        cursor={indexOf[cursor] ?? 0}
        height={display.length}
        width={ui.width - 4}
      />
      <Blank />
      <Line fg={theme.dim}>{rows[cursor]?.help ?? ""}</Line>
      <Blank />
      <Line fg={theme.faint}>{`yt-data ${ui.services.version}`}</Line>
    </box>
  );
}
