// A short list to pick one option from (quality, format, language…).
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { pad } from "../format.ts";
import { theme } from "../theme.ts";

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
  /** Colours drawn as ■ swatches (theme picker). */
  swatch?: string[];
  /** Starts a new labelled group above this option. */
  group?: string;
}

export function ChoiceScreen({
  title,
  options,
  initial,
  onPick,
  onHover,
  onCancel,
}: {
  title: string;
  options: ChoiceOption[];
  initial?: number;
  onPick: (value: string) => void;
  /** Called as the cursor moves (e.g. live theme preview). */
  onHover?: (value: string) => void;
  onCancel?: () => void;
}) {
  const ui = useUi();
  const [cursor, setCursor] = useState(Math.max(0, initial ?? 0));
  const labelWidth = Math.max(...options.map((o) => o.label.length));
  // Reserve room for group labels ("More · ") on every row so columns stay aligned.
  const groupWidth = Math.max(0, ...options.map((o) => (o.group ? o.group.length + 3 : 0)));
  useKeys([
    ["Enter", "choose"],
    ["↑↓", "move"],
    ["Esc", "cancel"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    const move = (to: number) => {
      const next = Math.max(0, Math.min(options.length - 1, to));
      setCursor(next);
      const opt = options[next];
      if (opt) onHover?.(opt.value);
    };
    if (key.name === "up") move(cursor - 1);
    if (key.name === "down") move(cursor + 1);
    if (key.name === "escape" || key.name === "backspace") {
      onCancel?.();
      ui.pop();
    }
    if (key.name === "return") {
      const opt = options[cursor];
      ui.pop();
      if (opt) onPick(opt.value);
    }
  });
  return (
    <box flexDirection="column">
      <Blank />
      <Line bold>{title}</Line>
      <Blank />
      <List
        rows={options.map((o) => ({
          key: o.value,
          parts: [
            {
              text: groupWidth ? pad(o.group ? `${o.group} · ` : "", groupWidth) : "",
              fg: theme.faint,
            },
            { text: pad(o.label, labelWidth) },
            ...(o.swatch ? [{ text: "  " }, ...o.swatch.map((c) => ({ text: "■ ", fg: c }))] : []),
            { text: `  ${o.hint ?? ""}`, fg: theme.dim },
          ],
        }))}
        cursor={cursor}
        height={ui.bodyHeight - 3}
        width={ui.width - 4}
      />
    </box>
  );
}
