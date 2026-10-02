// Effective settings. Precedence: flag > env > config file > default.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CliError } from "./errors.ts";
import type { LogLevel } from "./log.ts";
import { appPaths } from "./paths.ts";

export const FORMATS = ["json", "ndjson", "table", "csv"] as const;
export type Format = (typeof FORMATS)[number];

const LOG_LEVELS = ["silent", "error", "warn", "info", "debug"] as const;

const FileConfig = z
  .object({
    format: z.enum(FORMATS),
    region: z.string().regex(/^[A-Za-z]{2}$/),
    cookies: z.string(),
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
  proxy?: string;
  cacheDir: string;
  noCache: boolean;
  updateCheck: boolean;
  logLevel: LogLevel;
}

/** Global CLI flags, as parsed by commander. */
export interface GlobalFlags {
  format?: string;
  region?: string;
  cookies?: string;
  proxy?: string;
  cache?: boolean; // commander maps --no-cache to cache=false
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

export function loadConfig(flags: GlobalFlags = {}, env: NodeJS.ProcessEnv = process.env): Config {
  const paths = appPaths(env);
  const file = readConfigFile(env.YT_DATA_CONFIG || join(paths.config, "config.json"));

  const format = pick(flags.format, file.format) ?? "json";
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new CliError("USAGE", `Unknown format "${format}"`, `Use one of: ${FORMATS.join(", ")}`);
  }

  const envLog = env.YT_DATA_LOG as LogLevel | undefined;
  if (envLog && !LOG_LEVELS.includes(envLog)) {
    throw new CliError(
      "USAGE",
      `Invalid YT_DATA_LOG "${envLog}"`,
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

  return {
    format: format as Format,
    region,
    cookies: pick(flags.cookies, env.YT_DATA_COOKIES || undefined, file.cookies),
    proxy: pick(flags.proxy, env.YT_DATA_PROXY || undefined, file.proxy),
    cacheDir: pick(env.YT_DATA_CACHE_DIR || undefined, file.cacheDir) ?? paths.cache,
    noCache:
      pick(flags.cache === false ? true : undefined, envBool(env.YT_DATA_NO_CACHE), file.noCache) ??
      false,
    updateCheck: pick(invert(envBool(env.YT_DATA_NO_UPDATE_CHECK)), file.updateCheck) ?? true,
    logLevel: pick(flagLog, envLog, file.logLevel) ?? "warn",
  };
}

function invert(value: boolean | undefined): boolean | undefined {
  return value === undefined ? undefined : !value;
}
