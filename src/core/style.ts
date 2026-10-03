// Minimal ANSI styling for human output. Disabled when not a TTY or when NO_COLOR is set.

let enabled = !!process.stdout.isTTY && !process.env.NO_COLOR;

export function setColor(on: boolean) {
  enabled = on;
}

const wrap = (open: number, close: number) => (s: string) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
};

/** Visible width, ignoring ANSI escapes (East Asian wide chars count as 2). */
export function width(s: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  let w = 0;
  for (const ch of plain) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}

export function truncate(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (width(one) <= max) return one;
  let out = "";
  for (const ch of one) {
    if (width(out + ch) > max - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** 1234567 → "1.2M", 950 → "950". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, u] of units) {
    if (n >= v) return `${(n / v).toFixed(n / v >= 100 ? 0 : 1).replace(/\.0$/, "")}${u}`;
  }
  return String(n);
}

/** 213 → "3:33", 3723 → "1:02:03". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i && v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Columns of text, padded by visible width. */
export function columns(rows: string[][], header?: string[]): string {
  const all = header ? [header, ...rows] : rows;
  const widths = all[0]?.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? "")))) ?? [];
  const line = (r: string[]) =>
    r
      .map((cell, i) => cell + " ".repeat(Math.max(0, (widths[i] ?? 0) - width(cell))))
      .join("  ")
      .trimEnd();
  const out = all.map((r, i) => (header && i === 0 ? c.dim(line(r)) : line(r)));
  return `${out.join("\n")}\n`;
}
