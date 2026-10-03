import { expect, test } from "bun:test";
import { z } from "zod";
import { SearchResult } from "../../src/models/search.ts";
import { replayDeps } from "../helpers/fixtures.ts";
import { SCENARIOS } from "../helpers/scenarios.ts";

const Results = z.array(
  z.discriminatedUnion("type", SearchResult.options.map((o) => o.strict()) as never),
);

async function run(name: string) {
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  const { source, fetch } = await replayDeps(name);
  return Results.parse(await scenario.run(source, fetch)) as SearchResult[];
}

test("video search follows continuations", async () => {
  const items = await run("search-videos");
  expect(items.length).toBe(25);
  expect(new Set(items.map((i) => i.id)).size).toBe(25);
  for (const i of items) {
    expect(i.type).toBe("video");
    if (i.type !== "video") continue;
    expect(i.url).toBe(`https://www.youtube.com/watch?v=${i.id}`);
    expect(i.title).not.toBe("");
    expect(i.channel.name).not.toBe("");
  }
  const mkbhd = items.filter((i) => i.type === "video" && i.channel.handle === "@mkbhd");
  expect(mkbhd.length).toBeGreaterThan(3);
  expect(mkbhd.every((i) => i.type === "video" && i.channel.isVerified)).toBe(true);
});

test("channel search classifies shuffled subscriber/handle fields", async () => {
  const [first] = await run("search-channels");
  expect(first).toMatchObject({
    type: "channel",
    id: "UCBJycsmduvYEL83R_U4JriQ",
    handle: "@mkbhd",
    isVerified: true,
  });
  if (first?.type !== "channel") throw new Error("expected channel");
  expect(first.subscriberCount).toBeGreaterThan(1_000_000);
  expect(first.subscriberCountText).toMatch(/subscribers/);
});

test("playlist search", async () => {
  const items = await run("search-playlists");
  expect(items.length).toBe(3);
  for (const i of items) {
    expect(i.type).toBe("playlist");
    if (i.type !== "playlist") continue;
    expect(i.id).toMatch(/^PL|^OL/);
    expect(i.videoCount).toBeGreaterThan(0);
  }
});

test("shorts search marks shorts", async () => {
  const items = await run("search-shorts");
  expect(items.length).toBe(3);
  for (const i of items) expect(i.type === "video" && i.isShort).toBe(true);
});
