// Home: one input. A URL, @handle or id opens it; anything else searches.
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { parseRef } from "../../core/resolve.ts";
import type { SearchType } from "../../sources/innertube.ts";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { theme } from "../theme.ts";

const TYPES: { value: SearchType; label: string }[] = [
  { value: "video", label: "videos" },
  { value: "shorts", label: "shorts" },
  { value: "channel", label: "channels" },
  { value: "playlist", label: "playlists" },
];

export function HomeScreen() {
  const ui = useUi();
  const [value, setValue] = useState("");
  const [typeIndex, setTypeIndex] = useState(0);
  const [focus, setFocus] = useState<"input" | "list">("input");
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const type = TYPES[typeIndex] as (typeof TYPES)[number];
  const recent = ui.prefs.recent;

  function open(input: string) {
    try {
      ui.openRef(parseRef(input), input);
      return true;
    } catch {
      return false;
    }
  }

  function openRecent(i: number) {
    const r = recent[i];
    if (!r) return;
    if (r.kind === "search") ui.openSearch(r.value, "video");
    else open(r.value);
  }

  function submit(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setError(null);
    if (open(q)) {
      setInputKey((k) => k + 1);
      setValue("");
      return;
    }
    // Looks like a URL but isn't a YouTube one: say so instead of searching for it.
    if (/^https?:\/\//i.test(q)) {
      setError(
        "That isn't a YouTube link. Paste a youtube.com / youtu.be URL, an @handle or an id — or type words to search.",
      );
      return;
    }
    ui.openSearch(q, type.value);
  }

  useKeys(
    focus === "input"
      ? [
          ["Enter", value ? "open / search" : "type something first"],
          ["Tab", `search ${type.label}`],
          ...(recent.length ? ([["↓", "recent"]] as [string, string][]) : []),
          ["^S", "settings"],
          ["^O", "downloads"],
        ]
      : [
          ["Enter", "open"],
          ["↑↓", "move"],
          ["Esc", "back to typing"],
        ],
  );

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (focus === "input") {
      const step = (d: number) => setTypeIndex((i) => (i + d + TYPES.length) % TYPES.length);
      if (key.name === "tab") step(key.shift ? -1 : 1);
      // With an empty input the arrows have nothing to move through, so they switch type.
      if (!value && key.name === "right") step(1);
      if (!value && key.name === "left") step(-1);
      if (key.name === "down" && recent.length) {
        setFocus("list");
        setCursor(0);
      }
      return;
    }
    if (key.name === "up") {
      if (cursor === 0) setFocus("input");
      else setCursor((c) => c - 1);
    }
    if (key.name === "down") setCursor((c) => Math.min(recent.length - 1, c + 1));
    if (key.name === "escape" || key.name === "backspace") setFocus("input");
    if (key.name === "return") openRecent(cursor);
  });

  return (
    <box flexDirection="column">
      <Blank />
      <Line fg={theme.dim}>Paste a YouTube link, @handle or id — or type words to search.</Line>
      <box
        border
        borderColor={focus === "input" ? theme.accent : theme.faint}
        height={3}
        title={` search: ${type.label} ⇥ `}
        titleAlignment="right"
      >
        <input
          key={inputKey}
          focused={focus === "input"}
          placeholder="https://youtu.be/…   @mkbhd   lofi hip hop"
          onInput={setValue}
          onSubmit={() => submit(value)}
        />
      </box>
      {error ? <Line fg={theme.red}>{error}</Line> : <Blank />}
      {recent.length ? (
        <>
          <Line fg={theme.dim}>Recent</Line>
          <List
            rows={recent.map((r, i) => ({
              key: `${r.kind}-${i}`,
              dim: focus !== "list",
              parts: [
                { text: r.kind === "search" ? "search  " : "open    ", fg: theme.faint },
                { text: r.label },
                {
                  text:
                    r.label !== r.value && r.kind === "ref" && !r.label.includes(r.value)
                      ? `   ${r.value}`
                      : "",
                  fg: theme.faint,
                },
              ],
            }))}
            cursor={focus === "list" ? cursor : -1}
            height={Math.max(3, ui.bodyHeight - 7)}
            width={ui.width - 4}
          />
        </>
      ) : (
        <Line fg={theme.dim}>
          Try: a link · @handle · or words to search. Press ? for all keys.
        </Line>
      )}
    </box>
  );
}
