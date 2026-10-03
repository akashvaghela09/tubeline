// Read a transcript, switch language, save it in a chosen format.
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { shortClock } from "../../core/captions.ts";
import { toCliError } from "../../core/errors.ts";
import type { Transcript } from "../../models/video.ts";
import { askFolder, TRANSCRIPT_FORMATS } from "../actions.ts";
import { useKeys, useUi } from "../app.tsx";
import { Line } from "../components.tsx";
import { tildify, wrap } from "../format.ts";
import type { TranscriptChoice } from "../prefs.ts";
import { theme } from "../theme.ts";
import { ScrollText, scrollKeys } from "./viewer.tsx";

export interface TranscriptModel {
  videoId: string;
  title: string;
  langs: { lang: string; name: string }[];
  /** Chosen language; undefined = English if available, else the first track. */
  lang: string | undefined;
  top: number;
}

export function TranscriptScreen({ model }: { model: TranscriptModel }) {
  const ui = useUi();
  const { videoId, title, langs } = model;
  const lang = model.lang;
  const [t, setT] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [top, setTopState] = useState(model.top);
  const setTop = (n: number) => {
    model.top = n;
    setTopState(n);
  };

  useEffect(() => {
    let live = true;
    setT(null);
    setError(null);
    ui.services
      .getTranscript(videoId, lang)
      .then((r) => live && setT(r))
      .catch((err) => {
        const e = toCliError(err);
        if (live) setError(e.hint ? `${e.message} — ${e.hint}` : e.message);
      });
    return () => {
      live = false;
    };
  }, [videoId, lang, ui.services]);

  const w = Math.max(20, ui.width - 12);
  const lines = t
    ? t.segments.flatMap((s) =>
        wrap(s.text, w).map(
          (l, i) => `${i ? "        " : `${`[${shortClock(s.start)}]`.padEnd(8)}`}${l}`,
        ),
      )
    : [];
  const height = ui.bodyHeight - 1;

  const save = (format: TranscriptChoice, dir: string) => {
    if (!t) return;
    try {
      const path = ui.services.saveTranscript(t, title, format, dir);
      ui.toast(`Saved ${tildify(path)}`, "ok");
    } catch (err) {
      ui.toast(toCliError(err).message, "error");
    }
  };

  const chooseFormat = (then: (f: TranscriptChoice) => void) =>
    ui.push({
      kind: "choice",
      title: "Save transcript as",
      options: TRANSCRIPT_FORMATS,
      initial: Math.max(
        0,
        TRANSCRIPT_FORMATS.findIndex((f) => f.value === ui.prefs.transcriptFormat),
      ),
      onPick: (f) => {
        ui.prefs.transcriptFormat = f as TranscriptChoice;
        ui.savePrefs();
        then(f as TranscriptChoice);
      },
    });

  useKeys([
    ["s", `save ${ui.prefs.transcriptFormat} → ${tildify(ui.prefs.transcriptDir)}`],
    ["S", "save as…"],
    ...(langs.length > 1 ? ([["l", "language"]] as [string, string][]) : []),
    ["↑↓ PgUp PgDn", "scroll"],
    ["Esc", "back"],
  ]);

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape") return ui.pop();
    if (key.name === "s" && !key.shift && t)
      return save(ui.prefs.transcriptFormat, ui.prefs.transcriptDir);
    if (key.name === "s" && key.shift && t) {
      return chooseFormat((f) =>
        askFolder(ui, "Save transcript to", ui.prefs.transcriptDir, (dir) => {
          ui.prefs.transcriptDir = dir;
          ui.savePrefs();
          save(f, dir);
        }),
      );
    }
    if (key.name === "l" && langs.length > 1) {
      return ui.push({
        kind: "choice",
        title: "Transcript language",
        options: langs.map((l) => ({ value: l.lang, label: l.name, hint: l.lang })),
        initial: Math.max(
          0,
          langs.findIndex((l) => l.lang === (t?.lang ?? lang)),
        ),
        onPick: (l) => {
          model.lang = l;
          model.top = 0;
        },
      });
    }
    const next = scrollKeys(key, top, lines.length, height);
    if (next !== null) setTop(next);
  });

  if (error) return <Line fg={theme.red}>{`✗ ${error}`}</Line>;
  if (!t) return <Line fg={theme.dim}>Fetching transcript…</Line>;
  return (
    <box flexDirection="column">
      <Line fg={theme.dim}>
        {`${t.name ?? t.lang}${t.isTranslated ? " (translated)" : ""} · ${t.segments.length} lines${lines.length > height ? ` · ${top + 1}–${Math.min(lines.length, top + height)} of ${lines.length}` : ""}`}
      </Line>
      <ScrollText lines={lines} top={top} height={height} />
    </box>
  );
}
