import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchThumbnail, jpegSize } from "../../src/commands/thumbnail.ts";
import { CliError } from "../../src/core/errors.ts";
import { ThumbnailResult } from "../../src/models/results.ts";

const dir = mkdtempSync(join(tmpdir(), "tubeline-thumb-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A minimal JPEG header with a SOF0 frame of the given size. */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x03,
    0,
    0,
    0,
    0,
  ]);
}

/** `available` maps a file name to its image size; anything else is a 404. */
function fakeFetch(available: Record<string, [number, number]>) {
  const seen: string[] = [];
  const fn = async (input: Parameters<typeof fetch>[0]) => {
    const name = String(input).split("/").pop() as string;
    seen.push(name);
    const size = available[name];
    return size ? new Response(jpeg(size[0], size[1])) : new Response(null, { status: 404 });
  };
  return { fn, seen };
}

test("jpegSize reads the frame size", () => {
  expect(jpegSize(jpeg(1280, 720))).toEqual({ width: 1280, height: 720 });
  expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
});

test("skips YouTube's 120px placeholder and takes the next real size", async () => {
  const { fn, seen } = fakeFetch({ "maxresdefault.jpg": [120, 90], "sddefault.jpg": [640, 480] });
  const r = await fetchThumbnail(fn, "abcdefghijk", { quality: "best", output: dir });
  expect(r).toMatchObject({ quality: "sd", width: 640, height: 480 });
  expect(seen).toEqual(["maxresdefault.jpg", "sddefault.jpg"]);
});

test("best falls back from a missing maxres to the next available size and writes the file", async () => {
  const { fn, seen } = fakeFetch({ "sddefault.jpg": [640, 480], "hqdefault.jpg": [480, 360] });
  const r = await fetchThumbnail(fn, "abcdefghijk", { quality: "best", output: dir });
  ThumbnailResult.strict().parse(r);
  expect(r).toMatchObject({ quality: "sd", width: 640, height: 480 });
  expect(readFileSync(join(dir, "abcdefghijk.jpg")).length).toBe(22);
  expect(seen).toEqual(["maxresdefault.jpg", "sddefault.jpg"]);
});

test("--url-only starts at the requested quality and saves nothing", async () => {
  const { fn, seen } = fakeFetch({ "hqdefault.jpg": [480, 360] });
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
  expect(seen).toEqual(["hqdefault.jpg"]);
});

test("the genuine 120px default is accepted as the last resort", async () => {
  const { fn } = fakeFetch({ "default.jpg": [120, 90] });
  const r = await fetchThumbnail(fn, "abcdefghijk", {
    quality: "best",
    output: dir,
    filename: "Title [abcdefghijk].jpg",
  });
  expect(r).toMatchObject({ quality: "default", path: join(dir, "Title [abcdefghijk].jpg") });
});

test("nothing available → NOT_FOUND", async () => {
  const { fn } = fakeFetch({});
  const err = await fetchThumbnail(fn, "abcdefghijk", { quality: "best", output: dir }).catch(
    (e) => e,
  );
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).code).toBe("NOT_FOUND");
});
