// Scrollable text (details, setup check, update results). Long lines are word-wrapped.
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useKeys, useUi } from "../app.tsx";
import { Line } from "../components.tsx";
import { wrap } from "../format.ts";
import { theme } from "../theme.ts";

export function scrollKeys(
  key: { name: string; sequence?: string },
  top: number,
  total: number,
  page: number,
): number | null {
  const max = Math.max(0, total - page);
  switch (key.name) {
    case "up":
      return Math.max(0, top - 1);
    case "down":
      return Math.min(max, top + 1);
    case "pageup":
      return Math.max(0, top - page);
    case "pagedown":
    case "space":
      return Math.min(max, top + page);
    case "home":
      return 0;
    case "end":
      return max;
  }
  if (key.sequence === "g") return 0;
  if (key.sequence === "G") return max;
  return null;
}

export function ScrollText({
  lines,
  top,
  height,
}: {
  lines: string[];
  top: number;
  height: number;
}) {
  return (
    <box flexDirection="column">
      {lines.slice(top, top + height).map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional lines
        <Line key={top + i}>{l || " "}</Line>
      ))}
    </box>
  );
}

export function ViewerScreen({ title, text }: { title: string; text: string }) {
  const ui = useUi();
  const [top, setTop] = useState(0);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colors
  const lines = wrap(text.replace(/\x1b\[[0-9;]*m/g, "").trimEnd(), Math.max(20, ui.width - 4));
  const height = ui.bodyHeight - 1;
  useKeys([
    ["↑↓ PgUp PgDn", "scroll"],
    ["Esc", "back"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape" || key.name === "backspace") return ui.pop();
    const next = scrollKeys(key, top, lines.length, height);
    if (next !== null) setTop(next);
  });
  return (
    <box flexDirection="column">
      <Line
        fg={theme.dim}
      >{`${title}${lines.length > height ? `  (${top + 1}–${Math.min(lines.length, top + height)} of ${lines.length})` : ""}`}</Line>
      <ScrollText lines={lines} top={top} height={height} />
    </box>
  );
}
