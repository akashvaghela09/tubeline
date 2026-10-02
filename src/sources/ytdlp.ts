// Locating and running yt-dlp. A system install is preferred; otherwise a managed copy in
// the data dir (installed by `yt-data update --yt-dlp`) is used.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJson3 } from "../core/captions.ts";
import { CliError } from "../core/errors.ts";
import { log } from "../core/log.ts";
import { appPaths } from "../core/paths.ts";
import { videoUrl } from "../core/resolve.ts";
import type { TranscriptSegment } from "../models/video.ts";

export interface YtDlpLocation {
  path: string;
  kind: "env" | "system" | "managed";
}

export function managedYtDlpPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(appPaths(env).data, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

export function findYtDlp(env: NodeJS.ProcessEnv = process.env): YtDlpLocation | null {
  if (env.YT_DATA_YTDLP) {
    if (!existsSync(env.YT_DATA_YTDLP)) {
      throw new CliError(
        "MISSING_DEPENDENCY",
        `YT_DATA_YTDLP points to a missing file: ${env.YT_DATA_YTDLP}`,
      );
    }
    return { path: env.YT_DATA_YTDLP, kind: "env" };
  }
  const managed = managedYtDlpPath(env);
  const system = Bun.which("yt-dlp", { PATH: env.PATH ?? "" });
  if (system && system !== managed) return { path: system, kind: "system" };
  if (existsSync(managed)) return { path: managed, kind: "managed" };
  return null;
}

export function requireYtDlp(env: NodeJS.ProcessEnv = process.env): YtDlpLocation {
  const found = findYtDlp(env);
  if (!found) {
    throw new CliError(
      "MISSING_DEPENDENCY",
      "yt-dlp was not found",
      "Install it with `yt-data update --yt-dlp`",
    );
  }
  return found;
}

export interface YtDlpOptions {
  proxy?: string;
  cookies?: string;
  cookiesFromBrowser?: string;
}

export function commonArgs(opts: YtDlpOptions): string[] {
  const args = ["--no-warnings", "--no-progress", "--no-playlist"];
  if (opts.proxy) args.push("--proxy", opts.proxy);
  if (opts.cookies) args.push("--cookies", opts.cookies);
  if (opts.cookiesFromBrowser) args.push("--cookies-from-browser", opts.cookiesFromBrowser);
  return args;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runYtDlp(path: string, args: string[]): Promise<RunResult> {
  log.debug(`running ${path} ${args.join(" ")}`);
  const proc = Bun.spawn([path, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/** Map a failed yt-dlp run to a typed error using its ERROR: line. */
export function ytDlpError(stderr: string): CliError {
  const line =
    stderr
      .split("\n")
      .filter((l) => l.startsWith("ERROR:"))
      .at(-1)
      ?.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]{11}:\s*)?/, "") ??
    stderr.trim().split("\n").at(-1) ??
    "yt-dlp failed";
  if (/not a bot|HTTP Error 429|too many requests/i.test(line)) {
    return new CliError(
      "RATE_LIMITED",
      `yt-dlp: ${line}`,
      "Use --cookies / --cookies-from-browser or --proxy, or retry later",
    );
  }
  if (
    /private video|members[- ]only|join this channel|sign in to confirm your age|age-restricted|not available in your country|geo/i.test(
      line,
    )
  ) {
    return new CliError(
      "UNAVAILABLE",
      `yt-dlp: ${line}`,
      "Pass --cookies from a logged-in session",
    );
  }
  if (/video unavailable|does not exist|not found|removed/i.test(line)) {
    return new CliError("NOT_FOUND", `yt-dlp: ${line}`);
  }
  if (/unable to download|connection|timed out|resolve host/i.test(line)) {
    return new CliError("NETWORK", `yt-dlp: ${line}`);
  }
  return new CliError(
    "INTERNAL",
    `yt-dlp: ${line}`,
    "Run `yt-data update --yt-dlp` — YouTube changes often break older versions",
  );
}

/**
 * Fetch one subtitle track through yt-dlp. `auto` selects auto-generated captions, which
 * also covers YouTube's machine translations into other languages.
 */
export async function fetchSubtitles(
  id: string,
  lang: string,
  auto: boolean,
  opts: YtDlpOptions,
): Promise<TranscriptSegment[] | null> {
  const ytdlp = requireYtDlp();
  const dir = mkdtempSync(join(tmpdir(), "yt-data-subs-"));
  try {
    const args = [
      ...commonArgs(opts),
      "--skip-download",
      auto ? "--write-auto-subs" : "--write-subs",
      "--sub-langs",
      lang,
      "--sub-format",
      "json3",
      "-o",
      join(dir, "%(id)s.%(ext)s"),
      videoUrl(id),
    ];
    const res = await runYtDlp(ytdlp.path, args);
    if (res.code !== 0) throw ytDlpError(res.stderr);
    const file = readdirSync(dir).find((f) => f.endsWith(".json3"));
    if (!file) return null;
    return parseJson3(readFileSync(join(dir, file), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
