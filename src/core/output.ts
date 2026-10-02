// Rendering of command results: --fields projection and json | ndjson | table | csv.
import type { Format } from "./config.ts";
import { CliError } from "./errors.ts";

type Json = unknown;

export function parseFields(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const fields = value
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (!fields.length) throw new CliError("USAGE", "--fields needs at least one field name");
  return fields;
}

/**
 * Keep only the given dot paths. Paths through arrays apply to every element,
 * so `thumbnails.url` on a video yields `{ thumbnails: [{ url }, …] }`.
 */
export function project(value: Json, fields: string[]): Json {
  const out: Record<string, Json> = {};
  for (const field of fields) merge(out, pickPath(value, field.split(".")));
  return out;
}

function pickPath(value: Json, path: string[]): Json {
  if (!path.length) return value;
  if (Array.isArray(value)) return value.map((v) => pickPath(v, path));
  if (value === null || typeof value !== "object") return undefined;
  const [head, ...rest] = path as [string, ...string[]];
  if (!(head in value)) return {};
  return { [head]: pickPath((value as Record<string, Json>)[head], rest) };
}

function merge(target: Json, source: Json): Json {
  if (Array.isArray(target) && Array.isArray(source)) {
    return source.map((s, i) => merge(target[i] ?? {}, s));
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    for (const [k, v] of Object.entries(source)) {
      target[k] = k in target ? merge(target[k], v) : v;
    }
    return target;
  }
  return source;
}

function isPlainObject(v: Json): v is Record<string, Json> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export interface RenderOptions {
  format: Format;
  fields?: string[];
  /** Pretty-print JSON (default: when stdout is a terminal). */
  pretty?: boolean;
}

/**
 * Render a command result. `items` holds one entry per requested ref; `single` means the
 * command was given exactly one ref and JSON output should be that object, not an array.
 */
export function render(items: Json[], opts: RenderOptions & { single: boolean }): string {
  const rows = opts.fields ? items.map((i) => project(i, opts.fields as string[])) : items;
  switch (opts.format) {
    case "json": {
      const value = opts.single ? (rows[0] ?? null) : rows;
      return `${JSON.stringify(value, null, opts.pretty ? 2 : undefined)}\n`;
    }
    case "ndjson":
      return rows.map((r) => `${JSON.stringify(r)}\n`).join("");
    case "csv":
      return toCsv(rows);
    case "table":
      return toTable(rows);
  }
}

/** Flatten nested objects to dot-keyed scalars; arrays/objects below that become JSON. */
export function flatten(
  value: Json,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || "value"] = cell(value);
  }
  return out;
}

function cell(v: Json): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function columnsOf(flat: Record<string, string>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of flat) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

function toCsv(rows: Json[]): string {
  const flat = rows.map((r) => flatten(r));
  const cols = columnsOf(flat);
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    cols.map(esc).join(","),
    ...flat.map((r) => cols.map((c) => esc(r[c] ?? "")).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

const MAX_CELL = 60;

function toTable(rows: Json[]): string {
  if (!rows.length) return "";
  const flat = rows.map((r) => flatten(r));
  const clip = (s: string) => {
    const one = s.replace(/\s+/g, " ");
    return one.length > MAX_CELL ? `${one.slice(0, MAX_CELL - 1)}…` : one;
  };

  // A single record reads better as key/value pairs.
  if (flat.length === 1) {
    const entries = Object.entries(flat[0] as Record<string, string>);
    const width = Math.max(...entries.map(([k]) => k.length));
    return `${entries.map(([k, v]) => `${k.padEnd(width)}  ${clip(v)}`).join("\n")}\n`;
  }

  const cols = columnsOf(flat);
  const cells = flat.map((r) => cols.map((c) => clip(r[c] ?? "")));
  const widths = cols.map((c, i) =>
    Math.max(c.length, ...cells.map((row) => (row[i] as string).length)),
  );
  const line = (vals: string[]) =>
    vals
      .map((v, i) => v.padEnd(widths[i] as number))
      .join("  ")
      .trimEnd();
  return `${[line(cols), line(widths.map((w) => "-".repeat(w))), ...cells.map(line)].join("\n")}\n`;
}

/**
 * Incremental writer for list commands: NDJSON lines are written as items arrive; the other
 * formats need the full set (array brackets, column widths) and are written on end().
 */
export function createListWriter(
  opts: RenderOptions,
  out: (s: string) => void = (s) => process.stdout.write(s),
) {
  const buffered: Json[] = [];
  return {
    write(item: Json) {
      if (opts.format === "ndjson") out(render([item], { ...opts, single: false }));
      else buffered.push(item);
    },
    end() {
      if (opts.format !== "ndjson") out(render(buffered, { ...opts, single: false }));
    },
  };
}
