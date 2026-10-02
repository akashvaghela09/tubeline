// Minimal GitHub Releases client for the updater.
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";

export interface Release {
  tag: string;
  assets: Map<string, string>;
}

/** Latest release of `repo`, or null when the repo has no releases yet. */
export async function latestRelease(fetchFn: FetchFn, repo: string): Promise<Release | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "yt-data",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    throw new CliError(
      "RATE_LIMITED",
      "GitHub API rate limit reached",
      "Retry later or set GITHUB_TOKEN",
    );
  }
  if (!res.ok) throw new CliError("NETWORK", `GitHub API returned HTTP ${res.status} for ${repo}`);
  const body = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  return {
    tag: body.tag_name,
    assets: new Map(body.assets.map((a) => [a.name, a.browser_download_url])),
  };
}

export async function download(fetchFn: FetchFn, url: string): Promise<Uint8Array> {
  const res = await fetchFn(url, { headers: { "user-agent": "yt-data" } });
  if (!res.ok) throw new CliError("NETWORK", `Download failed: HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Parse a `sha256sum`-style file ("<hex>  <name>" or "<hex> *<name>"). */
export function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) map.set(m[2] as string, (m[1] as string).toLowerCase());
  }
  return map;
}

export function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/** Compare "1.2.3" / "v1.2.3-rc.1" versions: negative if a < b. Pre-releases sort before releases. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}
