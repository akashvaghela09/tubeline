// Runs a command over one or more refs and writes results/errors per the output contract.
import type { AppContext } from "./context.ts";
import { type CliError, toCliError } from "./errors.ts";
import { parseFields, render } from "./output.ts";

export interface RunOptions {
  fields?: string;
  concurrency?: number;
}

/** Expand "-" into refs read from stdin (one per line, blank lines and # comments skipped). */
export async function expandRefs(refs: string[]): Promise<string[]> {
  if (!refs.includes("-")) return refs;
  const stdin = await Bun.stdin.text();
  const fromStdin = stdin
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return refs.flatMap((r) => (r === "-" ? fromStdin : [r]));
}

export async function runForRefs<T>(
  ctx: AppContext,
  rawRefs: string[],
  opts: RunOptions,
  fn: (ref: string) => Promise<T>,
): Promise<void> {
  const fields = parseFields(opts.fields);
  const refs = await expandRefs(rawRefs);
  const results = await mapLimit(refs, opts.concurrency ?? 4, async (ref) => {
    try {
      return { ok: true as const, value: await fn(ref) };
    } catch (err) {
      return { ok: false as const, error: toCliError(err), ref };
    }
  });

  const values = results.flatMap((r) => (r.ok ? [r.value] : []));
  let firstError: CliError | undefined;
  for (const r of results) {
    if (r.ok) continue;
    firstError ??= r.error;
    process.stderr.write(
      `${JSON.stringify(r.error.toJSON(refs.length > 1 ? r.ref : undefined))}\n`,
    );
  }

  if (values.length || !firstError) {
    process.stdout.write(
      render(values, {
        format: ctx.config.format,
        fields,
        single: rawRefs.length === 1 && rawRefs[0] !== "-",
        pretty: process.stdout.isTTY,
      }),
    );
  }
  if (firstError) process.exitCode = firstError.exitCode;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}
