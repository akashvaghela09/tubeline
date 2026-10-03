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

/** A key hint: [key, label]. Screens list them most important first. */
export type Hint = [string, string];

const SEP = " · ";

/**
 * Footer hints: whole hints are dropped from the end until the rest fits — never cut
 * mid-word. `tail` (e.g. "? keys") is always kept.
 */
export function fitHints(hints: Hint[], tail: Hint[], cols: number): Hint[] {
  const len = (hs: Hint[]) =>
    hs.reduce((a, [k, l], i) => a + (i ? SEP.length : 0) + width(k) + 1 + width(l), 0);
  const kept = [...hints];
  while (kept.length && len([...kept, ...tail]) > cols) kept.pop();
  return [...kept, ...tail];
}

export function Keys({ keys }: { keys: Hint[] }) {
  return (
    <text wrapMode="none">
      {keys.map(([k, label], i) => (
        <span key={k + label}>
          {i > 0 ? <span fg={theme.faint}>{SEP}</span> : null}
          <span fg={theme.accent}>{k}</span>
          <span fg={theme.dim}> {label}</span>
        </span>
      ))}
    </text>
  );
}

/** A coloured run of text inside a list row. */
export interface Part {
  text: string;
  fg?: string;
  bold?: boolean;
}

export interface ListRow {
  key: string;
  /** Plain text, or coloured parts. */
  text?: string;
  parts?: Part[];
  dim?: boolean;
  color?: string;
}

/**
 * A windowed list: only the rows that fit are rendered, scrolled to keep the cursor visible.
 * The cursor bar spans the full width; with `marks`, a fixed 2-column selection mark
 * (● / ○) is always reserved so columns never shift.
 */
export function List({
  rows,
  cursor,
  height,
  width: total,
  selected,
  empty,
  marks,
}: {
  rows: ListRow[];
  cursor: number;
  height: number;
  width: number;
  selected?: Set<string>;
  empty?: string;
  marks?: boolean;
}) {
  if (!rows.length) return <Line fg={theme.dim}>{empty ?? "Nothing here."}</Line>;
  const h = Math.max(1, height);
  const start = Math.min(Math.max(0, cursor - Math.floor(h / 2)), Math.max(0, rows.length - h));
  const visible = rows.slice(start, start + h);
  const anySelected = !!selected?.size;
  return (
    <box flexDirection="column">
      {visible.map((r, i) => {
        const isCursor = start + i === cursor;
        const isSelected = !!selected?.has(r.key);
        const base = isSelected ? theme.selectedFg : (r.color ?? (r.dim ? theme.dim : theme.fg));
        const parts: Part[] = r.parts ?? [{ text: r.text ?? "" }];
        const used = 2 + (marks ? 2 : 0) + parts.reduce((a, p) => a + width(p.text), 0);
        return (
          <text key={r.key} bg={isCursor ? theme.cursorBg : undefined} wrapMode="none" truncate>
            <span fg={isCursor ? theme.accent : theme.faint}>{isCursor ? "▸ " : "  "}</span>
            {marks ? (
              <span fg={isSelected ? theme.selectedFg : theme.faint}>
                {isSelected ? "● " : anySelected ? "○ " : "  "}
              </span>
            ) : null}
            {parts.map((p, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed part order
              <span key={j} fg={isSelected ? base : (p.fg ?? base)}>
                {p.bold ? <strong>{p.text}</strong> : p.text}
              </span>
            ))}
            {isCursor && total > used ? <span>{" ".repeat(total - used)}</span> : null}
          </text>
        );
      })}
    </box>
  );
}
