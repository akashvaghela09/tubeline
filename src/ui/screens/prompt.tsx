// Folder picker: type a path (Tab completes), or pick a recent folder with ↑↓. Shows the
// resolved path and whether it will be created.
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { tildify } from "../format.ts";
import { expandHome } from "../prefs.ts";
import { theme } from "../theme.ts";

export interface FolderModel {
  title: string;
  initial: string;
  /** Returns an error message, or undefined when the folder was accepted. */
  onSubmit: (value: string) => string | undefined;
}

/** Complete the last path segment against existing folders. */
export function completeDir(input: string): { value: string; options: string[] } {
  const full = expandHome(input);
  const base = full.endsWith("/") ? full : dirname(full);
  const prefix = full.endsWith("/") ? "" : basename(full);
  let names: string[] = [];
  try {
    names = readdirSync(base, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          d.name.startsWith(prefix) &&
          (prefix.startsWith(".") || !d.name.startsWith(".")),
      )
      .map((d) => d.name)
      .sort();
  } catch {
    return { value: input, options: [] };
  }
  if (!names.length) return { value: input, options: [] };
  let common = names[0] as string;
  for (const n of names) while (!n.startsWith(common)) common = common.slice(0, -1);
  const completed = join(base, common) + (names.length === 1 ? "/" : "");
  return { value: tildify(completed), options: names.length > 1 ? names : [] };
}

export function FolderScreen({ model }: { model: FolderModel }) {
  const ui = useUi();
  const [value, setValue] = useState(tildify(model.initial));
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [focus, setFocus] = useState<"input" | "recent">("input");
  const [cursor, setCursor] = useState(0);
  const recent = [...new Set([ui.prefs.downloadDir, ...ui.prefs.recentDirs])]
    .filter((d) => d !== expandHome(value))
    .slice(0, 5);

  const set = (v: string) => {
    setValue(v);
    setInputKey((k) => k + 1);
    setError(null);
  };
  const submit = (v: string) => {
    const err = model.onSubmit(v);
    if (err) setError(err);
    else ui.pop();
  };

  useKeys(
    focus === "input"
      ? [
          ["Enter", "use this folder"],
          ["Tab", "complete"],
          ...(recent.length ? ([["↓", "recent folders"]] as [string, string][]) : []),
          ["Esc", "cancel"],
        ]
      : [
          ["Enter", "use"],
          ["↑↓", "move"],
          ["Esc", "back to typing"],
        ],
  );

  useKeyboard((k) => {
    if (k.ctrl || k.meta) return;
    if (focus === "input") {
      if (k.name === "escape") return ui.pop();
      if (k.name === "tab") {
        const r = completeDir(value);
        if (r.value !== value) set(r.value);
        setOptions(r.options);
      }
      if (k.name === "down" && recent.length) {
        setFocus("recent");
        setCursor(0);
      }
      return;
    }
    if (k.name === "escape" || (k.name === "up" && cursor === 0)) return setFocus("input");
    if (k.name === "up") setCursor((c) => c - 1);
    if (k.name === "down") setCursor((c) => Math.min(recent.length - 1, c + 1));
    if (k.name === "return" && recent[cursor]) submit(recent[cursor] as string);
  });

  const resolved = expandHome(value.trim() || model.initial);
  const exists = existsSync(resolved);
  const isFile = exists && !statSync(resolved).isDirectory();
  return (
    <box flexDirection="column">
      <Blank />
      <Line bold>{model.title}</Line>
      <box border borderColor={focus === "input" ? theme.accent : theme.faint} height={3}>
        <input
          key={inputKey}
          focused={focus === "input"}
          value={value}
          onInput={(v) => {
            setValue(v);
            setError(null);
            setOptions([]);
          }}
          onSubmit={() => submit(value)}
        />
      </box>
      {error ? (
        <Line fg={theme.red}>{`✗ ${error}`}</Line>
      ) : (
        <Line fg={isFile ? theme.red : exists ? theme.dim : theme.yellow}>
          {`→ ${resolved}${isFile ? "  (a file, not a folder)" : exists ? "" : "  (will be created)"}`}
        </Line>
      )}
      {options.length ? <Line fg={theme.dim}>{options.slice(0, 12).join("  ")}</Line> : <Blank />}
      {recent.length ? <Line fg={theme.dim}>Recent folders</Line> : null}
      <List
        rows={recent.map((d) => ({ key: d, text: tildify(d), dim: focus !== "recent" }))}
        cursor={focus === "recent" ? cursor : -1}
        height={recent.length}
        width={ui.width - 2}
      />
    </box>
  );
}
