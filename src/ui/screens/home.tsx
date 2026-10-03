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

type Item = { key: string; text: string; run: () => void };

export function HomeScreen() {
  const ui = useUi();
  const [value, setValue] = useState("");
  const [typeIndex, setTypeIndex] = useState(0);
  const [focus, setFocus] = useState<"input" | "list">("input");
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const type = TYPES[typeIndex] as (typeof TYPES)[number];

  const items: Item[] = [
    ...ui.prefs.recent.map((r, i) => ({
      key: `recent-${i}`,
      text: `${r.kind === "search" ? "search " : "open   "}${r.label}`,
      run: () => (r.kind === "search" ? ui.openSearch(r.value, "video") : open(r.value)),
    })),
    {
      key: "settings",
      text: "Settings                     ^S",
      run: () => ui.push({ kind: "settings", model: { cursor: 0 } }),
    },
    {
      key: "downloads",
      text: "Downloads                    ^O",
      run: () => ui.push({ kind: "downloads" }),
    },
  ];

  function open(input: string) {
    try {
      const ref = parseRef(input);
      ui.openRef(ref, input);
      return true;
    } catch {
      return false;
    }
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
          ["Enter", "open / search"],
          ["Tab", `search ${type.label}`],
          ["↓", "recent & more"],
        ]
      : [
          ["Enter", "open"],
          ["↑↓", "move"],
          ["Esc", "back to input"],
        ],
  );

  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (focus === "input") {
      if (key.name === "tab")
        setTypeIndex((i) => (i + (key.shift ? TYPES.length - 1 : 1)) % TYPES.length);
      if (key.name === "down" && items.length) {
        setFocus("list");
        setCursor(0);
      }
      return;
    }
    if (key.name === "up") {
      if (cursor === 0) setFocus("input");
      else setCursor((c) => c - 1);
    }
    if (key.name === "down") setCursor((c) => Math.min(items.length - 1, c + 1));
    if (key.name === "escape") setFocus("input");
    if (key.name === "return") items[cursor]?.run();
  });

  return (
    <box flexDirection="column">
      <Blank />
      <Line fg={theme.dim}>Paste a YouTube link, @handle or id — or type to search.</Line>
      <box
        border
        borderColor={focus === "input" ? theme.accent : theme.faint}
        height={3}
        title={` search: ${type.label} (Tab) `}
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
      {ui.prefs.recent.length ? <Line fg={theme.dim}>Recent</Line> : null}
      <List
        rows={items.map((i) => ({ key: i.key, text: i.text, dim: focus !== "list" }))}
        cursor={focus === "list" ? cursor : -1}
        height={Math.max(3, ui.bodyHeight - 7)}
      />
    </box>
  );
}
