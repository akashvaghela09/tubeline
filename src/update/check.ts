// Once-a-day "new version available" notice, on stderr and only for humans at a terminal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";
import type { Config } from "../core/config.ts";
import type { FetchFn } from "../core/http.ts";
import { compareVersions, latestRelease } from "./github.ts";
import { REPO } from "./self.ts";

const INTERVAL_MS = 24 * 3600_000;
const TIMEOUT_MS = 1500;

interface State {
  checkedAt: number;
  latest: string | null;
}

export function shouldCheck(config: Config, isTTY: boolean, command: string | undefined): boolean {
  return (
    config.updateCheck &&
    isTTY &&
    command !== "update" &&
    config.logLevel !== "silent" &&
    config.logLevel !== "error"
  );
}

/** Returns the notice to print, if any. Never throws and never waits longer than ~1.5 s. */
export async function updateNotice(
  config: Config,
  fetchFn: FetchFn,
  now = Date.now(),
): Promise<string | null> {
  const file = join(config.cacheDir, "update-check.json");
  let state: State | null = null;
  try {
    state = JSON.parse(readFileSync(file, "utf8")) as State;
  } catch {}

  if (!state || now - state.checkedAt > INTERVAL_MS) {
    try {
      const timedOut = Symbol("timeout");
      const timeout = new Promise<typeof timedOut>((resolve) =>
        setTimeout(() => resolve(timedOut), TIMEOUT_MS),
      );
      const release = await Promise.race([latestRelease(fetchFn, REPO), timeout]);
      // Too slow this time: say nothing and try again on the next run.
      if (release === timedOut) return null;
      state = { checkedAt: now, latest: release ? release.tag.replace(/^v/, "") : null };
      mkdirSync(config.cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(state));
    } catch {
      return null;
    }
  }
  if (state.latest && compareVersions(state.latest, pkg.version) > 0) {
    return `tubeline ${state.latest} is available (you have ${pkg.version}). Run \`tubeline update\`.`;
  }
  return null;
}
