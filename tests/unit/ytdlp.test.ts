import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError } from "../../src/core/errors.ts";
import { findYtDlp, ytDlpError } from "../../src/sources/ytdlp.ts";

test.each([
  ["ERROR: [youtube] abc: Sign in to confirm you’re not a bot.", "RATE_LIMITED"],
  [
    "ERROR: Unable to download video subtitles for 'de': HTTP Error 429: Too Many Requests",
    "RATE_LIMITED",
  ],
  [
    "ERROR: [youtube] dQw4w9WgXcQ: Private video. Sign in if you've been granted access",
    "UNAVAILABLE",
  ],
  ["ERROR: [youtube] x: Join this channel to get access to members-only content", "UNAVAILABLE"],
  ["ERROR: [youtube] aaaaaaaaaaa: Video unavailable", "NOT_FOUND"],
  ["ERROR: something unexpected", "INTERNAL"],
])("ytDlpError(%p) → %s", (stderr, code) => {
  const err = ytDlpError(`[youtube] Extracting URL\n${stderr}\n`);
  expect(err.code).toBe(code as CliError["code"]);
  expect(err.message).not.toContain("ERROR:");
});

test("findYtDlp honours YT_DATA_YTDLP", () => {
  const dir = mkdtempSync(join(tmpdir(), "yt-data-ytdlp-"));
  const bin = join(dir, "yt-dlp");
  writeFileSync(bin, "");
  expect(findYtDlp({ YT_DATA_YTDLP: bin })).toEqual({ path: bin, kind: "env" });
  expect(() => findYtDlp({ YT_DATA_YTDLP: join(dir, "missing") })).toThrow(CliError);
});

test("findYtDlp falls back to the managed copy, else null", () => {
  const data = mkdtempSync(join(tmpdir(), "yt-data-home-"));
  const env = { XDG_DATA_HOME: data, PATH: "/nonexistent" };
  if (process.platform !== "linux") return;
  expect(findYtDlp(env as NodeJS.ProcessEnv)).toBeNull();
});

test("ytDlpError trims yt-dlp FAQ pointers and recognises 'is unavailable'", () => {
  const age = ytDlpError(
    "ERROR: [youtube] HtVdAasjOgU: Sign in to confirm your age. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ",
  );
  expect(age.code).toBe("UNAVAILABLE");
  expect(age.message).toBe("yt-dlp: Sign in to confirm your age.");
  expect(ytDlpError("ERROR: [youtube] aaaaaaaaaaa: This video is unavailable").code).toBe(
    "NOT_FOUND",
  );
});
