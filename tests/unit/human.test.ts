import { beforeAll, expect, test } from "bun:test";
import { loadConfig } from "../../src/core/config.ts";
import { CliError, formatError, setHumanErrors } from "../../src/core/errors.ts";
import {
  channelHuman,
  doctorHuman,
  searchHuman,
  updateHuman,
  videoListHuman,
} from "../../src/core/human.ts";
import { compact, duration, setColor, truncate, width } from "../../src/core/style.ts";

beforeAll(() => setColor(false));

test("style helpers", () => {
  expect(compact(21_300_000)).toBe("21.3M");
  expect(compact(1_000)).toBe("1K");
  expect(compact(999)).toBe("999");
  expect(compact(null)).toBe("–");
  expect(duration(213)).toBe("3:33");
  expect(duration(3723)).toBe("1:02:03");
  expect(truncate("hello world", 8)).toBe("hello w…");
  expect(width("日本")).toBe(4);
});

test("channelHuman", () => {
  const out = channelHuman([
    {
      id: "UC1",
      handle: "@x",
      name: "X",
      description: "about",
      url: "https://www.youtube.com/channel/UC1",
      subscriberCount: 1_500_000,
      subscriberCountText: "1.5M subscribers",
      videoCount: 1234,
      viewCount: 5_000_000_000,
      joinedAt: "2008-03-21",
      country: "US",
      isVerified: true,
      isFamilySafe: true,
      keywords: [],
      links: [{ title: "Site", url: "https://x.example" }],
      avatar: null,
      banner: null,
      rssUrl: null,
    },
  ]);
  expect(out).toContain("X ✓  @x");
  expect(out).toContain("1.5M subscribers · 1,234 videos · 5B views · joined 2008-03-21 · US");
  expect(out).toContain("Site: https://x.example");
});

test("videoListHuman and searchHuman render rows", () => {
  const list = videoListHuman([
    {
      id: "abc",
      url: "u",
      title: "A video",
      type: "video",
      durationSeconds: 61,
      viewCount: 1200,
      viewCountText: "1.2K",
      publishedText: "2d ago",
      publishedAtApprox: null,
      isLive: false,
      isUpcoming: false,
      isMembersOnly: false,
      thumbnail: null,
      channelName: null,
    },
  ]);
  expect(list.split("\n")[1]).toMatch(/^1\s+A video\s+1\.2K\s+2d ago\s+1:01\s+abc$/);
  expect(videoListHuman([])).toContain("No videos");
  expect(searchHuman([])).toContain("No results");
});

test("doctorHuman and updateHuman", () => {
  const d = doctorHuman([
    {
      ok: false,
      version: "1.0.0",
      platform: "linux-x64",
      checks: [
        { name: "a", ok: true, required: true, detail: "fine", hint: null },
        { name: "b", ok: false, required: true, detail: "broken", hint: "fix it" },
      ],
    },
  ]);
  expect(d).toContain("✓ a");
  expect(d).toContain("✗ b");
  expect(d).toContain("→ fix it");
  expect(d).toContain("Some required checks failed");
  const u = updateHuman([
    {
      self: { action: "updated", from: "1.0.0", to: "1.1.0" },
      ytDlp: { action: "current", to: "2026.08.19" },
    },
  ]);
  expect(u).toContain("tubeline: updated 1.0.0 → 1.1.0");
  expect(u).toContain("yt-dlp: 2026.08.19 is already the latest");
});

test("formatError: JSON by default, readable when enabled", () => {
  const err = new CliError("NOT_FOUND", "Video x not found", "check the id");
  setHumanErrors(false);
  expect(JSON.parse(formatError(err))).toEqual({
    error: { code: "NOT_FOUND", message: "Video x not found", hint: "check the id" },
  });
  setHumanErrors(true);
  expect(formatError(err, "x")).toBe("✗ Video x not found (x)\n  → check the id\n");
  setHumanErrors(false);
});

test("output format: human at a terminal, JSON otherwise, --json wins", () => {
  const env = { TUBELINE_CONFIG: "/nonexistent.json" };
  expect(loadConfig({}, env, true).format).toBe("human");
  expect(loadConfig({}, env, false).format).toBe("json");
  expect(loadConfig({ json: true }, env, true).format).toBe("json");
  expect(loadConfig({ format: "table" }, env, true).format).toBe("table");
  expect(() => loadConfig({ json: true, format: "csv" }, env, true)).toThrow(CliError);
});
