// Listing behaviour against recorded InnerTube traffic.
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { VideoSummary } from "../../src/models/video.ts";
import { replaySource } from "../helpers/fixtures.ts";
import { SCENARIOS } from "../helpers/scenarios.ts";

const List = z.array(VideoSummary.strict());

async function run(name: string) {
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  return List.parse(await scenario.run(await replaySource(name)));
}

describe("videos listing", () => {
  test("videos tab follows continuations without duplicates", async () => {
    const items = await run("list-videos");
    expect(items.length).toBe(45);
    expect(new Set(items.map((i) => i.id)).size).toBe(45);
    for (const i of items) {
      expect(i.type).toBe("video");
      expect(i.url).toBe(`https://www.youtube.com/watch?v=${i.id}`);
      expect(i.title).not.toBe("");
      expect(i.durationSeconds).toBeGreaterThan(0);
      expect(i.viewCount).toBeGreaterThan(0);
      expect(i.publishedText).toMatch(/ago$/);
      expect(i.publishedAtApprox).not.toBeNull();
      expect(i.thumbnail?.url).toStartWith("https://i.ytimg.com/");
    }
    // Newest first.
    const dates = items.map((i) => Math.round(Date.parse(i.publishedAtApprox as string) / 60_000));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  test("shorts tab", async () => {
    const items = await run("list-shorts");
    expect(items.length).toBe(5);
    for (const i of items) {
      expect(i.type).toBe("short");
      expect(i.url).toBe(`https://www.youtube.com/shorts/${i.id}`);
      expect(i.viewCount).toBeGreaterThan(0);
    }
  });

  test("streams tab", async () => {
    const items = await run("list-streams");
    expect(items.length).toBe(5);
    for (const i of items) {
      expect(i.type).toBe("stream");
      expect(i.publishedText).toMatch(/^Streamed /);
    }
  });

  test("popular sort", async () => {
    const items = await run("list-popular");
    const views = items.map((i) => i.viewCount as number);
    expect(views).toEqual([...views].sort((a, b) => b - a));
    expect(views[0]).toBeGreaterThan(10_000_000);
  });

  test("--type all reads the uploads playlist", async () => {
    const items = await run("list-all");
    expect(items.length).toBe(5);
    for (const i of items) {
      expect(i.type).toBeNull();
      expect(i.channelName).toBe("Marques Brownlee");
    }
  });

  test("playlist is exhausted when shorter than the limit", async () => {
    const items = await run("list-playlist");
    expect(items.length).toBe(11);
    expect(items[0]?.title).toContain("RETRO TECH");
  });
});
