// Managed yt-dlp: install / update the standalone binary from yt-dlp's GitHub releases.
import { realpathSync } from "node:fs";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { findYtDlp, managedYtDlpPath, runYtDlp, type YtDlpLocation } from "../sources/ytdlp.ts";
import { latestRelease } from "./github.ts";
import { installAsset } from "./install.ts";

export const YTDLP_CHANNELS = {
  stable: "yt-dlp/yt-dlp",
  nightly: "yt-dlp/yt-dlp-nightly-builds",
} as const;
export type YtDlpChannel = keyof typeof YTDLP_CHANNELS;

export function ytDlpAsset(platform = process.platform, arch = process.arch): string {
  if (platform === "win32") return arch === "arm64" ? "yt-dlp_arm64.exe" : "yt-dlp.exe";
  if (platform === "darwin") return "yt-dlp_macos";
  if (platform === "linux") return arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
  throw new CliError(
    "USAGE",
    `No yt-dlp binary for ${platform}-${arch}`,
    "Install yt-dlp yourself and set YT_DATA_YTDLP",
  );
}

export async function ytDlpVersion(path: string): Promise<string | null> {
  try {
    const res = await runYtDlp(path, ["--version"]);
    return res.code === 0 ? res.stdout.trim() : null;
  } catch {
    return null;
  }
}

/** How a system yt-dlp was most likely installed, as an upgrade command. */
export function systemUpgradeHint(linkPath: string): string {
  let path = linkPath;
  try {
    path = realpathSync(linkPath); // ~/.local/bin/yt-dlp is often a pipx symlink
  } catch {}
  if (/pipx/.test(path)) return "pipx upgrade yt-dlp";
  if (/homebrew|Cellar|linuxbrew/.test(path)) return "brew upgrade yt-dlp";
  if (/site-packages|\/\.local\/bin\/|\/venv|python/i.test(path))
    return "python3 -m pip install -U yt-dlp";
  if (/^\/usr\/bin\//.test(path))
    return "upgrade it with your system package manager, or rely on the managed copy";
  return `${path} -U`;
}

export interface YtDlpStatus {
  active: (YtDlpLocation & { version: string | null }) | null;
  managed: { path: string; version: string | null };
  channel: YtDlpChannel;
  latest: string | null;
  updateAvailable: boolean;
}

export async function ytDlpStatus(fetchFn: FetchFn, channel: YtDlpChannel): Promise<YtDlpStatus> {
  const managedPath = managedYtDlpPath();
  const found = findYtDlp();
  const [activeVersion, managedVersion, release] = await Promise.all([
    found ? ytDlpVersion(found.path) : null,
    found?.kind === "managed" ? null : ytDlpVersion(managedPath).catch(() => null),
    latestRelease(fetchFn, YTDLP_CHANNELS[channel]),
  ]);
  const managed = {
    path: managedPath,
    version: found?.kind === "managed" ? activeVersion : managedVersion,
  };
  const latest = release?.tag ?? null;
  return {
    active: found ? { ...found, version: activeVersion } : null,
    managed,
    channel,
    latest,
    updateAvailable: !!latest && managed.version !== latest,
  };
}

export async function updateYtDlp(fetchFn: FetchFn, channel: YtDlpChannel) {
  const path = managedYtDlpPath();
  const [before, release] = await Promise.all([
    ytDlpVersion(path),
    latestRelease(fetchFn, YTDLP_CHANNELS[channel]),
  ]);
  if (!release)
    throw new CliError("NETWORK", `No yt-dlp release found in ${YTDLP_CHANNELS[channel]}`);
  if (before === release.tag)
    return { action: "current" as const, path, from: before, to: release.tag, channel };
  await installAsset(fetchFn, release, ytDlpAsset(), "SHA2-256SUMS", path);
  const after = await ytDlpVersion(path);
  if (!after)
    throw new CliError(
      "INTERNAL",
      "The installed yt-dlp doesn't run",
      "Please report this with `yt-data doctor -v`",
    );
  return {
    action: before ? ("updated" as const) : ("installed" as const),
    path,
    from: before,
    to: after,
    channel,
  };
}
