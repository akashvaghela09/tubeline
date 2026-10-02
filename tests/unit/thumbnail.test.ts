import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchThumbnail } from "../../src/commands/thumbnail.ts";
import { CliError } from "../../src/core/errors.ts";
import { ThumbnailResult } from "../../src/models/results.ts";

const dir = mkdtempSync(join(tmpdir(), "yt-data-thumb-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeFetch(available: string[]) {
  const seen: string[] = [];
  const fn = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    seen.push(`${init?.method ?? "GET"} ${url.split("/").pop()}`);
    const ok = available.some((f) => url.endsWith(f));
    return new Response(ok && init?.method !== "HEAD" ? "JPEGDATA" : null, {
      status: ok ? 200 : 404,
    });
  };
  return { fn, seen };
}

test("best falls back from maxres to the next available size and writes the file", async () => {
  const { fn, seen } = fakeFetch(["sddefault.jpg", "hqdefault.jpg"]);
  const r = await fetchThumbnail(fn, "abcdefghijk", { quality: "best", output: dir });
  ThumbnailResult.strict().parse(r);
  expect(r).toMatchObject({ quality: "sd", width: 640, height: 480, sizeBytes: 8 });
  expect(readFileSync(join(dir, "abcdefghijk.jpg"), "utf8")).toBe("JPEGDATA");
  expect(seen).toEqual(["GET maxresdefault.jpg", "GET sddefault.jpg"]);
});

test("--url-only uses HEAD and starts at the requested quality", async () => {
  const { fn, seen } = fakeFetch(["hqdefault.jpg"]);
  const r = await fetchThumbnail(fn, "abcdefghijk", { quality: "hq", output: dir, urlOnly: true });
  expect(r).toEqual({
    id: "abcdefghijk",
    quality: "hq",
    url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    width: 480,
    height: 360,
    path: null,
    sizeBytes: null,
  });
  expect(seen).toEqual(["HEAD hqdefault.jpg"]);
});

test("nothing available → NOT_FOUND", async () => {
  const { fn } = fakeFetch([]);
  const err = await fetchThumbnail(fn, "abcdefghijk", { quality: "best", output: dir }).catch(
    (e) => e,
  );
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).code).toBe("NOT_FOUND");
});
