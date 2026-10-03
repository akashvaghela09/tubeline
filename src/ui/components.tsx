// Small building blocks shared by the screens.
import type { ReactNode } from "react";
import { width } from "../core/style.ts";
import { theme } from "./theme.ts";

/** One line of text that never wraps. */
export function Line({
  children,
  fg,
  bg,
  bold,
}: {
  children: ReactNode;
  fg?: string;
  bg?: string;
  bold?: boolean;
}) {
  return (
    <text fg={fg ?? theme.fg} bg={bg} wrapMode="none" truncate>
      {bold ? <strong>{children}</strong> : children}
    </text>
  );
}

export function Blank() {
  return <text> </text>;
}

/** Key hints for the footer: [["Enter", "open"], ["/", "filter"]]. */
export function Keys({ keys }: { keys: [string, string][] }) {
  return (
    <text wrapMode="none" truncate>
      {keys.map(([k, label], i) => (
        <span key={k + label}>
          {i > 0 ? <span fg={theme.faint}> · </span> : null}
          <span fg={theme.accent}>{k}</span>
          <span fg={theme.dim}> {label}</span>
        </span>
      ))}
    </text>
  );
}

export interface ListRow {
  key: string;
  text: string;
  dim?: boolean;
  color?: string;
}

/**
 * A windowed list: only the rows that fit are rendered, scrolled to keep the cursor visible.
 * `selected` rows get a ● marker; the cursor row is highlighted.
 */
export function List({
  rows,
  cursor,
  height,
  selected,
  empty,
  showMarks,
}: {
  rows: ListRow[];
  cursor: number;
  height: number;
  selected?: Set<string>;
  empty?: string;
  showMarks?: boolean;
}) {
  if (!rows.length) return <Line fg={theme.dim}>{empty ?? "Nothing here."}</Line>;
  const h = Math.max(1, height);
  const start = Math.min(Math.max(0, cursor - Math.floor(h / 2)), Math.max(0, rows.length - h));
  const visible = rows.slice(start, start + h);
  return (
    <box flexDirection="column">
      {visible.map((r, i) => {
        const index = start + i;
        const isCursor = index === cursor;
        const isSelected = selected?.has(r.key);
        const mark = showMarks ? (isSelected ? "● " : "○ ") : "";
        return (
          <text key={r.key} bg={isCursor ? theme.cursorBg : undefined} wrapMode="none" truncate>
            <span fg={isCursor ? theme.accent : theme.faint}>{isCursor ? "▸ " : "  "}</span>
            {showMarks ? (
              <span fg={isSelected ? theme.selectedFg : theme.faint}>{mark}</span>
            ) : null}
            <span fg={isSelected ? theme.selectedFg : (r.color ?? (r.dim ? theme.dim : theme.fg))}>
              {r.text}
            </span>
          </text>
        );
      })}
    </box>
  );
}

/** "▲ 12 more" style indicator when a list is scrolled. */
export function scrollInfo(total: number, height: number, cursor: number): string {
  if (total <= height) return "";
  return `${cursor + 1}/${total}`;
}

export function textWidth(s: string): number {
  return width(s);
}
