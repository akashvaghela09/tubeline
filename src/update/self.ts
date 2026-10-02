// Self-update of the compiled yt-data binary from this project's GitHub releases.
import { accessSync, constants } from "node:fs";
import { dirname } from "node:path";
import pkg from "../../package.json";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { compareVersions, latestRelease } from "./github.ts";
import { installAsset } from "./install.ts";

export const REPO = "akashvaghela09/yt-data";

export function selfAsset(platform = process.platform, arch = process.arch): string {
  const os = platform === "win32" ? "windows" : platform;
  if (!["linux", "darwin", "windows"].includes(os) || !["x64", "arm64"].includes(arch)) {
    throw new CliError("USAGE", `No yt-data binary for ${platform}-${arch}`);
  }
  if (os === "windows" && arch !== "x64")
    throw new CliError("USAGE", "Only x64 Windows binaries are published");
  return `yt-data-${os}-${arch}${os === "windows" ? ".exe" : ""}`;
}

/** True when running as a `bun build --compile` binary rather than from source. */
export function isCompiled(): boolean {
  return Bun.main.startsWith("/$bunfs/") || /~BUN/.test(Bun.main);
}

export async function selfStatus(fetchFn: FetchFn) {
  const release = await latestRelease(fetchFn, REPO);
  const latest = release?.tag.replace(/^v/, "") ?? null;
  return {
    current: pkg.version,
    latest,
    updateAvailable: !!latest && compareVersions(latest, pkg.version) > 0,
    path: process.execPath,
    compiled: isCompiled(),
  };
}

export async function updateSelf(fetchFn: FetchFn) {
  if (!isCompiled()) {
    throw new CliError(
      "USAGE",
      "Running from source; self-update only works for release binaries",
      "Use `git pull && bun install`",
    );
  }
  const target = process.execPath;
  try {
    accessSync(dirname(target), constants.W_OK);
  } catch {
    throw new CliError(
      "USAGE",
      `${dirname(target)} is not writable`,
      "Re-run with permissions for that directory, or reinstall with install.sh into ~/.local/bin",
    );
  }
  const release = await latestRelease(fetchFn, REPO);
  if (!release)
    return {
      action: "current" as const,
      from: pkg.version,
      to: pkg.version,
      reason: "no releases published yet",
    };
  const latest = release.tag.replace(/^v/, "");
  if (compareVersions(latest, pkg.version) <= 0)
    return { action: "current" as const, from: pkg.version, to: pkg.version };
  await installAsset(fetchFn, release, selfAsset(), "SHA256SUMS", target);
  return { action: "updated" as const, from: pkg.version, to: latest, path: target };
}
