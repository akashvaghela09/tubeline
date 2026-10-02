import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json";
import { loadConfig } from "../../src/core/config.ts";
import { shouldCheck, updateNotice } from "../../src/update/check.ts";

const dir = mkdtempSync(join(tmpdir(), "yt-data-check-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = (sub: string) =>
  loadConfig({}, { YT_DATA_CONFIG: join(dir, "none.json"), YT_DATA_CACHE_DIR: join(dir, sub) });

function releases(tag: string | null) {
  let calls = 0;
  const fn = async () => {
    calls++;
    return tag ? Response.json({ tag_name: tag, assets: [] }) : new Response("", { status: 404 });
  };
  return { fn, calls: () => calls };
}

test("notifies about a newer release and checks at most once a day", async () => {
  const c = config("a");
  const gh = releases("v99.0.0");
  const now = Date.now();
  expect(await updateNotice(c, gh.fn, now)).toContain("yt-data 99.0.0 is available");
  expect(await updateNotice(c, gh.fn, now + 3600_000)).toContain("99.0.0");
  expect(gh.calls()).toBe(1);
  await updateNotice(c, gh.fn, now + 25 * 3600_000);
  expect(gh.calls()).toBe(2);
});

test("silent when current or when no releases exist", async () => {
  expect(await updateNotice(config("b"), releases(`v${pkg.version}`).fn)).toBeNull();
  expect(await updateNotice(config("c"), releases(null).fn)).toBeNull();
});

test("shouldCheck: only interactive, enabled, not during update", () => {
  const c = config("d");
  expect(shouldCheck(c, true, "video")).toBe(true);
  expect(shouldCheck(c, false, "video")).toBe(false);
  expect(shouldCheck(c, true, "update")).toBe(false);
  expect(shouldCheck({ ...c, updateCheck: false }, true, "video")).toBe(false);
});
