import { accessSync, constants, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import pkg from "../../package.json";
import type { AppContext } from "../core/context.ts";
import { CliError, type ErrorCode, toCliError } from "../core/errors.ts";
import { doctorHuman } from "../core/human.ts";
import { parseFields, render } from "../core/output.ts";
import { appPaths } from "../core/paths.ts";
import { videoUrl } from "../core/resolve.ts";
import { commonArgs, findFfmpeg, findYtDlp, runYtDlp, ytDlpError } from "../sources/ytdlp.ts";

const STALE_YTDLP_DAYS = 90;

/** yt-dlp versions are release dates: "2026.06.09" (nightlies add ".123456"). */
export function ytDlpAgeDays(version: string, now = Date.now()): number | null {
  const m = version.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  const released = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((now - released) / 86_400_000);
}

/** A stable, public, captioned video used as the canary for every source. */
const CANARY = "jNQXAC9IVRw";

export interface Check {
  name: string;
  ok: boolean;
  /** Required checks decide the exit code; the rest only matter for some commands. */
  required: boolean;
  detail: string;
  hint: string | null;
  code?: ErrorCode;
}

export function registerDoctor(program: Command, getCtx: () => AppContext) {
  program
    .command("doctor")
    .summary("check dependencies and data sources")
    .description(
      "Check yt-dlp, ffmpeg, the cache directory, and run a small request against each data source (InnerTube metadata, captions, thumbnails, yt-dlp extraction).",
    )
    .option("--offline", "only check local dependencies, no network requests")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Output: {ok, version, checks[{name, ok, required, detail, hint}]}
Exit 0 when every required check passes; otherwise the code of the first failed required check.`,
    )
    .action(async (opts: { offline?: boolean; fields?: string }) => {
      const ctx = getCtx();
      const checks = await runChecks(ctx, !opts.offline);
      const failed = checks.find((c) => c.required && !c.ok);
      const report = {
        ok: !failed,
        version: pkg.version,
        platform: `${process.platform}-${process.arch}`,
        checks,
      };
      const fields = parseFields(opts.fields);
      const format = ctx.config.format;
      // A table of the checks reads better than a flattened report.
      const tabular = format === "table" || format === "csv";
      process.stdout.write(
        render(tabular ? checks : [report], {
          format,
          fields,
          single: !tabular,
          pretty: process.stdout.isTTY,
          human: doctorHuman,
        }),
      );
      if (failed)
        process.exitCode = new CliError(failed.code ?? "INTERNAL", failed.detail).exitCode;
    });
}

export async function runChecks(ctx: AppContext, online: boolean): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Local dependencies.
  let ytdlpPath: string | null = null;
  try {
    const found = findYtDlp();
    if (found) {
      ytdlpPath = found.path;
      const res = await runYtDlp(found.path, ["--version"]);
      const version = res.stdout.trim();
      const age = ytDlpAgeDays(version);
      if (res.code === 0 && age !== null && age > STALE_YTDLP_DAYS) {
        add({
          name: "yt-dlp",
          ok: false,
          required: false,
          detail: `${version} is ${age} days old (${found.kind}: ${found.path}); YouTube changes break old versions`,
          hint:
            found.kind === "managed"
              ? "Run `tubeline update --yt-dlp`"
              : "Upgrade it with your package manager, or remove it to use the managed copy (`tubeline update --yt-dlp`)",
          code: "MISSING_DEPENDENCY",
        });
      } else
        add({
          name: "yt-dlp",
          ok: res.code === 0,
          required: false,
          detail:
            res.code === 0
              ? `${res.stdout.trim()} (${found.kind}: ${found.path})`
              : `fails to run: ${res.stderr.trim()}`,
          hint: res.code === 0 ? null : "Reinstall with `tubeline update --yt-dlp`",
          code: "MISSING_DEPENDENCY",
        });
    } else {
      add({
        name: "yt-dlp",
        ok: false,
        required: false,
        detail: "not found (needed for download and the transcript fallback)",
        hint: "Install with `tubeline update --yt-dlp`",
        code: "MISSING_DEPENDENCY",
      });
    }
  } catch (err) {
    add({
      name: "yt-dlp",
      ok: false,
      required: false,
      detail: toCliError(err).message,
      hint: null,
      code: "MISSING_DEPENDENCY",
    });
  }

  const ffmpeg = findFfmpeg();
  add({
    name: "ffmpeg",
    ok: ffmpeg !== null,
    required: false,
    detail:
      ffmpeg ?? "not found (downloads are limited to pre-merged ≤360p files; no audio conversion)",
    hint: ffmpeg ? null : "Install ffmpeg from your package manager",
    code: "MISSING_DEPENDENCY",
  });

  add(await tuiCheck());
  add(writableDir("cache dir", ctx.config.cacheDir));
  add({ name: "config", ok: true, required: true, detail: configPath(), hint: null });

  if (!online) return checks;

  // Data sources, each exercised with one small request.
  const source = await probe(add, "innertube session", async () => {
    await ctx.innertube();
    return "created";
  });
  if (source !== undefined) {
    await probe(add, "innertube metadata", async () => {
      const v = await (await ctx.innertube()).getVideo(CANARY);
      return `video ${v.id}: "${v.title}"`;
    });
    await probe(
      add,
      "innertube captions",
      async () => {
        const tracks = await (await ctx.innertube()).getCaptionTracks(CANARY);
        if (!tracks.length) throw new CliError("INTERNAL", "no caption tracks returned");
        return `${tracks.length} track(s)`;
      },
      false,
    );
  }
  await probe(
    add,
    "thumbnails",
    async () => {
      const res = await ctx.fetch(`https://i.ytimg.com/vi/${CANARY}/hqdefault.jpg`, {
        method: "HEAD",
      });
      if (!res.ok) throw new CliError("NETWORK", `HTTP ${res.status}`);
      return "i.ytimg.com reachable";
    },
    false,
  );
  if (ytdlpPath) {
    const path = ytdlpPath;
    await probe(
      add,
      "yt-dlp extraction",
      async () => {
        const res = await runYtDlp(path, [
          ...commonArgs(ctx.ytdlp),
          "--simulate",
          "--print",
          "%(id)s %(format_id)s",
          videoUrl(CANARY),
        ]);
        if (res.code !== 0) throw ytDlpError(res.stderr);
        return `formats resolved (${res.stdout.trim()})`;
      },
      false,
    );
  }
  return checks;
}

async function probe(
  add: (c: Check) => void,
  name: string,
  fn: () => Promise<string>,
  required = true,
): Promise<string | undefined> {
  try {
    const detail = await fn();
    add({ name, ok: true, required, detail, hint: null });
    return detail;
  } catch (err) {
    const e = toCliError(err);
    add({ name, ok: false, required, detail: e.message, hint: e.hint ?? null, code: e.code });
    return undefined;
  }
}

/** The interactive UI's native renderer (OpenTUI) must load on this platform. */
async function tuiCheck(): Promise<Check> {
  try {
    const { resolveRenderLib } = await import("@opentui/core");
    resolveRenderLib();
    return {
      name: "interactive ui",
      ok: true,
      required: false,
      detail: "native renderer loads",
      hint: null,
    };
  } catch (err) {
    return {
      name: "interactive ui",
      ok: false,
      required: false,
      detail: `native renderer failed to load: ${(err as Error).message}`,
      hint: "Commands still work; only `tubeline ui` is affected. Please report your platform.",
      code: "INTERNAL",
    };
  }
}

function writableDir(name: string, dir: string): Check {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return { name, ok: true, required: false, detail: dir, hint: null };
  } catch (err) {
    return {
      name,
      ok: false,
      required: false,
      detail: `${dir}: ${(err as Error).message}`,
      hint: "Set TUBELINE_CACHE_DIR to a writable directory, or use --no-cache",
      code: "INTERNAL",
    };
  }
}

function configPath(): string {
  return process.env.TUBELINE_CONFIG || join(appPaths().config, "config.json");
}
