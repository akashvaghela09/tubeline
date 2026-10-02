import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { parseRef, refKindLabel } from "../core/resolve.ts";
import { runForRefs } from "../core/run.ts";

/** i.ytimg.com variants, best first. maxres/sd don't exist for every video. */
export const THUMB_SIZES = [
  { quality: "maxres", file: "maxresdefault.jpg", width: 1280, height: 720 },
  { quality: "sd", file: "sddefault.jpg", width: 640, height: 480 },
  { quality: "hq", file: "hqdefault.jpg", width: 480, height: 360 },
  { quality: "mq", file: "mqdefault.jpg", width: 320, height: 180 },
  { quality: "default", file: "default.jpg", width: 120, height: 90 },
] as const;

const QUALITIES = ["best", ...THUMB_SIZES.map((s) => s.quality)] as const;

interface ThumbnailOptions {
  quality: (typeof QUALITIES)[number];
  output: string;
  urlOnly?: boolean;
  fields?: string;
}

export function registerThumbnail(program: Command, getCtx: () => AppContext) {
  program
    .command("thumbnail")
    .summary("download video thumbnails")
    .description(
      "Download the highest available thumbnail of each video (or the requested quality, falling back to the next smaller one).",
    )
    .argument("<refs...>", "video URL or id, or - to read refs from stdin")
    .addOption(new Option("--quality <q>", "thumbnail quality").choices(QUALITIES).default("best"))
    .option("-o, --output <dir>", "output directory (files are named <id>.jpg)", ".")
    .option("--url-only", "print the URL instead of downloading")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data thumbnail dQw4w9WgXcQ
  yt-data thumbnail dQw4w9WgXcQ --quality hq -o ./thumbs
  yt-data thumbnail dQw4w9WgXcQ --url-only --fields url

Output: {id, quality, url, width, height, path, sizeBytes} (path/sizeBytes are null with --url-only).`,
    )
    .action(async (refs: string[], opts: ThumbnailOptions) => {
      const ctx = getCtx();
      if (!opts.urlOnly) mkdirSync(opts.output, { recursive: true });
      await runForRefs(ctx, refs, opts, async (ref) => {
        const parsed = parseRef(ref);
        if (parsed.kind !== "video")
          throw new CliError("USAGE", `"${ref}" is a ${refKindLabel(parsed)}, not a video`);
        return fetchThumbnail(ctx.fetch, parsed.id, opts);
      });
    });
}

export async function fetchThumbnail(
  fetchFn: FetchFn,
  id: string,
  opts: Pick<ThumbnailOptions, "quality" | "output" | "urlOnly">,
) {
  const start =
    opts.quality === "best" ? 0 : THUMB_SIZES.findIndex((s) => s.quality === opts.quality);
  for (const size of THUMB_SIZES.slice(start)) {
    const url = `https://i.ytimg.com/vi/${id}/${size.file}`;
    const res = await fetchFn(url, { method: opts.urlOnly ? "HEAD" : "GET" });
    if (res.status === 404) continue;
    if (!res.ok) throw new CliError("NETWORK", `Thumbnail request failed: HTTP ${res.status}`);
    const base = { id, quality: size.quality, url, width: size.width, height: size.height };
    if (opts.urlOnly) return { ...base, path: null, sizeBytes: null };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = join(opts.output, `${id}.jpg`);
    writeFileSync(path, bytes);
    return { ...base, path, sizeBytes: bytes.length };
  }
  throw new CliError("NOT_FOUND", `No thumbnail for video ${id}`, "Check the video id");
}
