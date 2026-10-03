// A short list to pick one option from (quality, format, language…).
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line, List } from "../components.tsx";
import { pad } from "../format.ts";

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

export function ChoiceScreen({
  title,
  options,
  initial,
  onPick,
}: {
  title: string;
  options: ChoiceOption[];
  initial?: number;
  onPick: (value: string) => void;
}) {
  const ui = useUi();
  const [cursor, setCursor] = useState(Math.max(0, initial ?? 0));
  const labelWidth = Math.max(...options.map((o) => o.label.length));
  useKeys([
    ["Enter", "choose"],
    ["↑↓", "move"],
    ["Esc", "cancel"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "up") setCursor((c) => Math.max(0, c - 1));
    if (key.name === "down") setCursor((c) => Math.min(options.length - 1, c + 1));
    if (key.name === "escape") ui.pop();
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
          text: `${pad(o.label, labelWidth)}   ${o.hint ?? ""}`,
        }))}
        cursor={cursor}
        height={ui.bodyHeight - 3}
      />
    </box>
  );
}
