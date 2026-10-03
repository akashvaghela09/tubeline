import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { jsonSchema, SCHEMAS } from "../../src/models/index.ts";
import { DoctorReport } from "../../src/models/results.ts";

const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      YT_DATA_CONFIG: "/nonexistent/config.json",
      YT_DATA_NO_UPDATE_CHECK: "1",
    },
  });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout, code };
}

describe("schemas", () => {
  test.each(SCHEMAS.map((s) => s.name))("%s converts to JSON Schema", (name) => {
    const entry = SCHEMAS.find((s) => s.name === name);
    const schema = jsonSchema(entry as (typeof SCHEMAS)[number]);
    expect(schema.title).toBe(name);
    // Object schemas, or a oneOf/anyOf of objects for tagged unions (search).
    expect(
      schema.type === "object" || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf),
    ).toBe(true);
    expect(JSON.stringify(schema)).not.toContain("9007199254740991");
  });

  test("`schema video` prints the video schema", async () => {
    const r = await run("schema", "video");
    expect(r.code).toBe(0);
    const schema = JSON.parse(r.stdout);
    expect(schema.properties.publishedAt).toBeDefined();
    expect(schema.required).toContain("id");
  });
});

describe("docs", () => {
  test("markdown reference covers every command", async () => {
    const r = await run("docs");
    expect(r.code).toBe(0);
    for (const cmd of [
      "channel",
      "videos",
      "search",
      "video",
      "transcript",
      "ui",
      "thumbnail",
      "download",
      "update",
      "doctor",
      "schema",
    ]) {
      expect(r.stdout).toContain(`### \`${cmd}`);
    }
  });

  test("man page is generated from command definitions", async () => {
    const r = await run("docs", "--man");
    expect(r.stdout).toStartWith(".TH YT\\-DATA 1");
    for (const flag of [
      "\\-\\-since",
      "\\-\\-audio\\-format",
      "\\-\\-yt\\-dlp\\-channel",
      "\\-\\-cookies\\-from\\-browser",
    ]) {
      expect(r.stdout).toContain(flag);
    }
    expect(r.stdout).not.toContain("(default: true)");
  });
});

test("doctor --offline output matches its schema", async () => {
  const r = await run("doctor", "--offline");
  const report = DoctorReport.strict().parse(JSON.parse(r.stdout));
  expect(report.checks.map((c) => c.name)).toEqual([
    "yt-dlp",
    "ffmpeg",
    "interactive ui",
    "cache dir",
    "config",
  ]);
  expect(report.checks.find((c) => c.name === "interactive ui")?.ok).toBe(true);
  expect(r.code).toBe(0);
});
