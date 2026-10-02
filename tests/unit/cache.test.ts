import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResponseCache, TTL } from "../../src/core/cache.ts";

const dir = mkdtempSync(join(tmpdir(), "yt-data-cache-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("normal mode reads back within TTL, misses after it", () => {
  let now = 1_000_000;
  const cache = new ResponseCache(join(dir, "a"), "normal", "1.0.0", () => now);
  expect(cache.get("video", "x")).toBeUndefined();
  cache.set("video", "x", { id: "x" });
  expect(cache.get<{ id: string }>("video", "x")).toEqual({ id: "x" });
  now += TTL.video + 1;
  expect(cache.get("video", "x")).toBeUndefined();
});

test("entries from another app version are ignored", () => {
  new ResponseCache(join(dir, "b"), "normal", "1.0.0").set("channel", "c", 1);
  expect(new ResponseCache(join(dir, "b"), "normal", "1.1.0").get("channel", "c")).toBeUndefined();
});

test("refresh mode writes but never reads; off does neither", () => {
  const path = join(dir, "c");
  const refresh = new ResponseCache(path, "refresh", "1");
  refresh.set("video", "k", "fresh");
  expect(refresh.get("video", "k")).toBeUndefined();
  expect(new ResponseCache(path, "normal", "1").get<string>("video", "k")).toBe("fresh");

  const off = new ResponseCache(path, "off", "1");
  off.set("video", "k2", "x");
  expect(new ResponseCache(path, "normal", "1").get("video", "k2")).toBeUndefined();
});
