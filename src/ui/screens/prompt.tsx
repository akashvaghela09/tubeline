// A single text field (folder paths and the like), with validation shown inline.
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useKeys, useUi } from "../app.tsx";
import { Blank, Line } from "../components.tsx";
import { theme } from "../theme.ts";

export function PromptScreen({
  title,
  initial,
  hint,
  onSubmit,
}: {
  title: string;
  initial: string;
  hint?: string;
  onSubmit: (value: string) => string | undefined;
}) {
  const ui = useUi();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useKeys([
    ["Enter", "confirm"],
    ["Esc", "cancel"],
  ]);
  useKeyboard((key) => {
    if (key.ctrl || key.meta) return;
    if (key.name === "escape") ui.pop();
  });
  return (
    <box flexDirection="column">
      <Blank />
      <Line bold>{title}</Line>
      <box border borderColor={theme.accent} height={3}>
        <input
          focused
          value={initial}
          onInput={(v) => {
            setValue(v);
            setError(null);
          }}
          onSubmit={() => {
            const err = onSubmit(value);
            if (err) setError(err);
            else ui.pop();
          }}
        />
      </box>
      {error ? <Line fg={theme.red}>{error}</Line> : <Line fg={theme.dim}>{hint ?? ""}</Line>}
    </box>
  );
}
