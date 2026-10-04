// Effective settings. Precedence: flag > env > config file > default.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { CacheMode } from "./cache.ts";
import { CliError } from "./errors.ts";
import type { LogLevel } from "./log.ts";
import { appPaths } from "./paths.ts";

export const FORMATS = ["human", "json", "ndjson", "table", "csv"] as const;
export type Format = (typeof FORMATS)[number];

const LOG_LEVELS = ["silent", "error", "warn", "info", "debug"] as const;

const FileConfig = z
  .object({
    format: z.enum(FORMATS),
    region: z.string().regex(/^[A-Za-z]{2}$/),
    cookies: z.string(),
    cookiesFromBrowser: z.string(),
    proxy: z.string(),
    cacheDir: z.string(),
    noCache: z.boolean(),
    updateCheck: z.boolean(),
    logLevel: z.enum(LOG_LEVELS),
  })
  .partial()
  .strict();

export interface Config {
  format: Format;
  region: string;
  cookies?: string;
  /** Only used by yt-dlp (downloads, transcript fallback). */
  cookiesFromBrowser?: string;
  proxy?: string;
  cacheDir: string;
  noCache: boolean;
  cacheMode: CacheMode;
  updateCheck: boolean;
  logLevel: LogLevel;
}

/** Global CLI flags, as parsed by commander. */
export interface GlobalFlags {
  format?: string;
  json?: boolean;
  region?: string;
  cookies?: string;
  cookiesFromBrowser?: string;
  proxy?: string;
  cache?: boolean; // commander maps --no-cache to cache=false
  refresh?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

function readConfigFile(path: string): z.infer<typeof FileConfig> {
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new CliError("USAGE", `Config file ${path} is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = FileConfig.safeParse(raw);
  if (!parsed.success) {
    throw new CliError("USAGE", `Invalid config file ${path}: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

function envBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function pick<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((v) => v !== undefined);
}

export function loadConfig(
  flags: GlobalFlags = {},
  env: NodeJS.ProcessEnv = process.env,
  isTTY = !!process.stdout.isTTY,
): Config {
  const paths = appPaths(env);
  const file = readConfigFile(env.TUBELINE_CONFIG || join(paths.config, "config.json"));

  if (flags.json && flags.format && flags.format !== "json") {
    throw new CliError("USAGE", `--json conflicts with --format ${flags.format}`);
  }
  // Humans at a terminal get readable output; pipes, agents and --json get JSON.
  const format =
    pick(flags.format, flags.json ? "json" : undefined, file.format) ?? (isTTY ? "human" : "json");
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new CliError("USAGE", `Unknown format "${format}"`, `Use one of: ${FORMATS.join(", ")}`);
  }

  const envLog = env.TUBELINE_LOG as LogLevel | undefined;
  if (envLog && !LOG_LEVELS.includes(envLog)) {
    throw new CliError(
      "USAGE",
      `Invalid TUBELINE_LOG "${envLog}"`,
      `Use one of: ${LOG_LEVELS.join(", ")}`,
    );
  }
  const flagLog: LogLevel | undefined = flags.verbose ? "debug" : flags.quiet ? "error" : undefined;

  const region = (pick(flags.region, file.region) ?? "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new CliError(
      "USAGE",
      `Invalid region "${region}"`,
      "Use a 2-letter country code, e.g. US",
    );
  }

  const noCache =
    pick(flags.cache === false ? true : undefined, envBool(env.TUBELINE_NO_CACHE), file.noCache) ??
    false;

  return {
    format: format as Format,
    region,
    cookies: pick(flags.cookies, env.TUBELINE_COOKIES || undefined, file.cookies),
    cookiesFromBrowser: pick(
      flags.cookiesFromBrowser,
      env.TUBELINE_COOKIES_FROM_BROWSER || undefined,
      file.cookiesFromBrowser,
    ),
    proxy: pick(flags.proxy, env.TUBELINE_PROXY || undefined, file.proxy),
    cacheDir: pick(env.TUBELINE_CACHE_DIR || undefined, file.cacheDir) ?? paths.cache,
    noCache,
    cacheMode: noCache ? "off" : flags.refresh ? "refresh" : "normal",
    updateCheck: pick(invert(envBool(env.TUBELINE_NO_UPDATE_CHECK)), file.updateCheck) ?? true,
    logLevel: pick(flagLog, envLog, file.logLevel) ?? "warn",
  };
}

function invert(value: boolean | undefined): boolean | undefined {
  return value === undefined ? undefined : !value;
}
