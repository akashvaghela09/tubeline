// Verified, atomic replacement of an executable on disk.
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { download, parseChecksums, type Release, sha256 } from "./github.ts";

/**
 * Download `asset` from `release`, verify it against `checksumsAsset`, and atomically move it
 * to `target`. On Windows a running executable can't be overwritten, so the old one is moved
 * aside to `<target>.old` first (removed on the next start).
 */
export async function installAsset(
  fetchFn: FetchFn,
  release: Release,
  asset: string,
  checksumsAsset: string,
  target: string,
): Promise<void> {
  const url = release.assets.get(asset);
  if (!url)
    throw new CliError(
      "NOT_FOUND",
      `Release ${release.tag} has no asset ${asset}`,
      "This platform may not be supported",
    );
  const sumsUrl = release.assets.get(checksumsAsset);
  if (!sumsUrl)
    throw new CliError(
      "INTERNAL",
      `Release ${release.tag} has no ${checksumsAsset}; refusing to install unverified`,
    );

  const [bytes, sums] = await Promise.all([download(fetchFn, url), download(fetchFn, sumsUrl)]);
  const expected = parseChecksums(new TextDecoder().decode(sums)).get(asset);
  if (!expected) throw new CliError("INTERNAL", `${checksumsAsset} has no entry for ${asset}`);
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new CliError(
      "INTERNAL",
      `Checksum mismatch for ${asset}`,
      "The download may be corrupted; try again",
    );
  }

  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.download-${process.pid}`;
  try {
    writeFileSync(tmp, bytes);
    chmodSync(tmp, 0o755);
    if (process.platform === "win32" && existsSync(target)) {
      rmSync(`${target}.old`, { force: true });
      renameSync(target, `${target}.old`);
    }
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw new CliError(
      "INTERNAL",
      `Could not write ${target}: ${(err as Error).message}`,
      "Check permissions on that directory",
    );
  }
}

/** Best-effort cleanup of `<path>.old` left by a Windows self-update. */
export function cleanupOld(path: string) {
  if (process.platform === "win32") rmSync(`${path}.old`, { force: true });
}
