import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ytDlpAgeDays } from "../../src/commands/doctor.ts";
import { CliError } from "../../src/core/errors.ts";
import { compareVersions, parseChecksums, type Release, sha256 } from "../../src/update/github.ts";
import { installAsset } from "../../src/update/install.ts";
import { selfAsset } from "../../src/update/self.ts";
import { systemUpgradeHint, ytDlpAsset } from "../../src/update/ytdlp.ts";

const dir = mkdtempSync(join(tmpdir(), "tubeline-update-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("compareVersions", () => {
  expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  expect(compareVersions("v1.10.0", "1.9.9")).toBeGreaterThan(0);
  expect(compareVersions("0.1.0", "0.1.1")).toBeLessThan(0);
  expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
  expect(compareVersions("1.0", "1.0.0")).toBe(0);
});

test("parseChecksums handles text and binary markers", () => {
  const a = "a".repeat(64);
  const b = "B".repeat(64);
  expect(parseChecksums(`${a}  yt-dlp_linux\n${b} *yt-dlp.exe\n\njunk\n`)).toEqual(
    new Map([
      ["yt-dlp_linux", a],
      ["yt-dlp.exe", b.toLowerCase()],
    ]),
  );
});

test("asset names per platform", () => {
  expect(selfAsset("linux", "x64")).toBe("tubeline-linux-x64");
  expect(selfAsset("darwin", "arm64")).toBe("tubeline-darwin-arm64");
  expect(selfAsset("win32", "x64")).toBe("tubeline-windows-x64.exe");
  expect(() => selfAsset("freebsd", "x64")).toThrow(CliError);
  expect(ytDlpAsset("linux", "x64")).toBe("yt-dlp_linux");
  expect(ytDlpAsset("linux", "arm64")).toBe("yt-dlp_linux_aarch64");
  expect(ytDlpAsset("darwin", "arm64")).toBe("yt-dlp_macos");
  expect(ytDlpAsset("win32", "x64")).toBe("yt-dlp.exe");
});

test("systemUpgradeHint guesses the installer", () => {
  expect(systemUpgradeHint("/home/u/.local/share/pipx/venvs/yt-dlp/bin/yt-dlp")).toBe(
    "pipx upgrade yt-dlp",
  );
  expect(systemUpgradeHint("/opt/homebrew/bin/yt-dlp")).toBe("brew upgrade yt-dlp");
});

test("ytDlpAgeDays", () => {
  const now = Date.UTC(2026, 9, 1);
  expect(ytDlpAgeDays("2026.09.01", now)).toBe(30);
  expect(ytDlpAgeDays("2026.09.01.234512", now)).toBe(30);
  expect(ytDlpAgeDays("garbage", now)).toBeNull();
});

describe("installAsset", () => {
  const payload = new TextEncoder().encode("#!/bin/sh\necho new\n");
  const sums = (hash: string) => new TextEncoder().encode(`${hash}  tool\n`);
  const release = (
    hash: string,
  ): { release: Release; fetch: (u: Parameters<typeof fetch>[0]) => Promise<Response> } => ({
    release: {
      tag: "v9.9.9",
      assets: new Map([
        ["tool", "https://dl/tool"],
        ["SUMS", "https://dl/SUMS"],
      ]),
    },
    fetch: async (u) => new Response(String(u).endsWith("SUMS") ? sums(hash) : payload),
  });

  test("verifies, replaces atomically and makes executable", async () => {
    const target = join(dir, "bin", "tool");
    const { release: r, fetch } = release(sha256(payload));
    await installAsset(fetch, r, "tool", "SUMS", target);
    expect(readFileSync(target, "utf8")).toBe("#!/bin/sh\necho new\n");
    if (process.platform !== "win32") expect(statSync(target).mode & 0o111).not.toBe(0);
  });

  test("refuses a checksum mismatch and leaves the old file alone", async () => {
    const target = join(dir, "keep");
    writeFileSync(target, "old");
    const { release: r, fetch } = release("0".repeat(64));
    const err = await installAsset(fetch, r, "tool", "SUMS", target).catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).message).toContain("Checksum mismatch");
    expect(readFileSync(target, "utf8")).toBe("old");
    expect(existsSync(`${target}.download-${process.pid}`)).toBe(false);
  });

  test("refuses unverifiable releases", async () => {
    const { fetch } = release(sha256(payload));
    const r: Release = { tag: "v1", assets: new Map([["tool", "https://dl/tool"]]) };
    const err = await installAsset(fetch, r, "tool", "SUMS", join(dir, "x")).catch((e) => e);
    expect((err as CliError).message).toContain("refusing to install unverified");
  });
});
