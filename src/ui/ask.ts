// Thin wrappers over @clack/prompts: cancelling (Esc / Ctrl+C) throws Back, which each menu
// treats as "go up one level".
import * as p from "@clack/prompts";
import { CliError, toCliError } from "../core/errors.ts";
import { expandHome } from "./prefs.ts";

export class Back extends Error {}

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) throw new Back();
  return value as T;
}

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

export async function choose<T>(
  message: string,
  options: Choice<T>[],
  initialValue?: T,
): Promise<T> {
  return unwrap<T>(
    await p.select<T>({ message, options: options as never, initialValue, maxItems: 12 }),
  );
}

/** Type-to-filter list, for long lists of videos and results. */
export async function pick<T>(message: string, options: Choice<T>[]): Promise<T> {
  return unwrap<T>(
    await p.autocomplete<T>({
      message,
      options: options as never,
      maxItems: 12,
      placeholder: "type to filter",
    }),
  );
}

export async function pickMany<T>(message: string, options: Choice<T>[]): Promise<T[]> {
  return unwrap<T[]>(
    await p.multiselect<T>({ message, options: options as never, maxItems: 12, required: true }),
  );
}

export async function ask(
  message: string,
  opts: {
    placeholder?: string;
    initial?: string;
    validate?: (v: string) => string | undefined;
  } = {},
): Promise<string> {
  return unwrap<string>(
    await p.text({
      message,
      placeholder: opts.placeholder,
      initialValue: opts.initial,
      validate: opts.validate ? (v) => opts.validate?.(v ?? "") : undefined,
    }),
  ).trim();
}

export async function askFolder(message: string, initial: string): Promise<string> {
  const value = unwrap(await p.path({ message, directory: true, initialValue: initial }));
  return expandHome(String(value).trim() || initial);
}

export async function confirm(message: string, initialValue = true): Promise<boolean> {
  return unwrap<boolean>(await p.confirm({ message, initialValue }));
}

/** Run `fn` behind a spinner; errors are shown and rethrown. */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  done?: (v: T) => string,
): Promise<T> {
  const s = p.spinner();
  s.start(message);
  try {
    const value = await fn();
    s.stop(done ? done(value) : message);
    return value;
  } catch (err) {
    s.error(`${message} — failed`);
    throw err;
  }
}

export function showError(err: unknown) {
  const e = err instanceof CliError ? err : toCliError(err);
  p.log.error(e.hint ? `${e.message}\n→ ${e.hint}` : e.message);
}
