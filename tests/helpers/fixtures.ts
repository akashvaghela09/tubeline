// Record/replay of InnerTube HTTP traffic so contract tests run the real mapping code offline.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FetchFn } from "../../src/core/http.ts";
import { createInnertube, InnertubeSource } from "../../src/sources/innertube.ts";

export const FIXTURE_DIR = join(import.meta.dir, "..", "fixtures", "innertube");

interface Entry {
  key: string;
  status: number;
  contentType: string | null;
  body: string;
}

/**
 * Requests are matched on what identifies the resource, not on volatile session fields
 * (visitor data, client version, timezone), so recordings replay on any machine.
 */
export async function requestKey(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<string> {
  const req = new Request(input as Request, init);
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      body = (await req.clone().json()) as Record<string, unknown>;
    } catch {}
  }
  const client = (body.context as { client?: { clientName?: string } } | undefined)?.client
    ?.clientName;
  const ident = {
    client,
    videoId: body.videoId,
    browseId: body.browseId,
    params: body.params,
    continuation: body.continuation,
    url: body.url,
  };
  return `${req.method} ${url.host}${url.pathname} ${JSON.stringify(ident)}`;
}

export function recordingFetch(entries: Entry[]): FetchFn {
  return async (input, init) => {
    const key = await requestKey(input, init);
    const res = await fetch(input as Request, init);
    const body = await res.text();
    entries.push({ key, status: res.status, contentType: res.headers.get("content-type"), body });
    return new Response(body, { status: res.status, headers: res.headers });
  };
}

export function replayFetch(entries: Entry[]): FetchFn {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return async (input, init) => {
    const key = await requestKey(input, init);
    const hit = byKey.get(key);
    if (!hit)
      throw new Error(`No recorded response for ${key} — re-run scripts/record-fixtures.ts`);
    return new Response(hit.body, {
      status: hit.status,
      headers: hit.contentType ? { "content-type": hit.contentType } : {},
    });
  };
}

export function fixturePath(name: string): string {
  return join(FIXTURE_DIR, `${name}.json.gz`);
}

export function loadFixture(name: string): Entry[] {
  const path = fixturePath(name);
  if (!existsSync(path))
    throw new Error(`Missing fixture ${path} — run: bun run scripts/record-fixtures.ts`);
  return JSON.parse(new TextDecoder().decode(Bun.gunzipSync(readFileSync(path))));
}

export function saveFixture(name: string, entries: Entry[]) {
  writeFileSync(
    fixturePath(name),
    Bun.gzipSync(new TextEncoder().encode(JSON.stringify(entries)), { level: 9 }),
  );
}

/** A source wired to replay a recorded fixture. */
export async function replaySource(name: string): Promise<InnertubeSource> {
  const yt = await createInnertube({ region: "US", fetch: replayFetch(loadFixture(name)) });
  return new InnertubeSource(yt);
}

export type { Entry };
