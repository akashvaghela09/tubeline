// On-disk TTL cache for mapped results (channels, videos, handle lookups).
// Entries are tagged with the app version so a model change never serves stale shapes.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.ts";

/** normal: read + write · refresh: write only · off: neither. */
export type CacheMode = "normal" | "refresh" | "off";

export const TTL = {
  handle: 7 * 24 * 3600_000,
  channel: 6 * 3600_000,
  video: 3600_000,
  transcript: 7 * 24 * 3600_000,
} as const;

interface EntryFile<T> {
  v: string;
  at: number;
  value: T;
}

export class ResponseCache {
  constructor(
    private readonly dir: string | undefined,
    private readonly mode: CacheMode,
    private readonly version: string,
    private readonly now: () => number = Date.now,
  ) {}

  static disabled(): ResponseCache {
    return new ResponseCache(undefined, "off", "");
  }

  get<T>(ns: keyof typeof TTL, key: string): T | undefined {
    if (!this.dir || this.mode !== "normal") return undefined;
    try {
      const entry = JSON.parse(readFileSync(this.path(ns, key), "utf8")) as EntryFile<T>;
      if (entry.v !== this.version || this.now() - entry.at > TTL[ns]) return undefined;
      log.debug(`cache hit ${ns}:${key}`);
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set<T>(ns: keyof typeof TTL, key: string, value: T): void {
    if (!this.dir || this.mode === "off") return;
    const file = this.path(ns, key);
    try {
      mkdirSync(join(this.dir, ns), { recursive: true });
      // Write-then-rename so concurrent runs never read a half-written entry.
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(
        tmp,
        JSON.stringify({ v: this.version, at: this.now(), value } satisfies EntryFile<T>),
      );
      renameSync(tmp, file);
    } catch (err) {
      log.debug(`cache write failed for ${ns}:${key}: ${(err as Error).message}`);
    }
  }

  private path(ns: string, key: string): string {
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
    return join(this.dir as string, ns, `${hash}.json`);
  }
}
