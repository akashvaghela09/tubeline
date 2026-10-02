import { expect, test } from "bun:test";
import { CliError } from "../../src/core/errors.ts";
import { Transcript } from "../../src/models/video.ts";
import { replayDeps } from "../helpers/fixtures.ts";
import { SCENARIOS } from "../helpers/scenarios.ts";

async function run(name: string) {
  const scenario = SCENARIOS.find((s) => s.name === name);
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  const { source, fetch } = await replayDeps(name);
  return scenario.run(source, fetch);
}

test("manual English captions by default", async () => {
  const t = Transcript.strict().parse(await run("transcript-manual"));
  expect(t).toMatchObject({
    videoId: "dQw4w9WgXcQ",
    lang: "en",
    isAuto: false,
    isTranslated: false,
    source: "innertube",
  });
  expect(t.segments.length).toBeGreaterThan(30);
  expect(t.segments.some((s) => s.text.includes("Never gonna give you up"))).toBe(true);
  const starts = t.segments.map((s) => s.start);
  expect(starts).toEqual([...starts].sort((a, b) => a - b));
});

test("--prefer auto picks the auto-generated track and joins word timings", async () => {
  const t = Transcript.strict().parse(await run("transcript-auto"));
  expect(t).toMatchObject({ lang: "en", isAuto: true, name: "English (auto-generated)" });
  expect(t.segments[0]?.text).toBe("Often I think about this a lot. I think");
  for (const s of t.segments) expect(s.text).not.toMatch(/<|&amp;|\s{2}/);
});

test("explicit language", async () => {
  const t = Transcript.strict().parse(await run("transcript-other-lang"));
  expect(t.lang).toBe("ja");
  expect(t.segments.length).toBeGreaterThan(0);
});

test("unavailable language without fallback → NOT_FOUND listing what exists", async () => {
  const err = await run("transcript-missing-lang").catch((e) => e);
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).code).toBe("NOT_FOUND");
  expect((err as CliError).hint).toContain("ja");
});
