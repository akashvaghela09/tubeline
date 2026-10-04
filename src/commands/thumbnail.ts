import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import type { FetchFn } from "../core/http.ts";
import { thumbnailHuman } from "../core/human.ts";
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
  tubeline thumbnail dQw4w9WgXcQ
  tubeline thumbnail dQw4w9WgXcQ --quality hq -o ./thumbs
  tubeline thumbnail dQw4w9WgXcQ --url-only --fields url

Output: {id, quality, url, width, height, path, sizeBytes} (path/sizeBytes are null with --url-only).`,
    )
    .action(async (refs: string[], opts: ThumbnailOptions) => {
      const ctx = getCtx();
      if (!opts.urlOnly) mkdirSync(opts.output, { recursive: true });
      await runForRefs(ctx, refs, { ...opts, human: thumbnailHuman }, async (ref) => {
        const parsed = parseRef(ref);
        if (parsed.kind !== "video")
          throw new CliError("USAGE", `"${ref}" is a ${refKindLabel(parsed)}, not a video`);
        return fetchThumbnail(ctx.fetch, parsed.id, opts);
      });
    });
}

/** Width and height of a JPEG, read from its SOF marker; null if it isn't one. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1] as number;
    // SOF0–SOF15 carry the frame size (except DHT C4, JPG C8, DAC CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = ((bytes[i + 5] as number) << 8) | (bytes[i + 6] as number);
      const width = ((bytes[i + 7] as number) << 8) | (bytes[i + 8] as number);
      return { width, height };
    }
    const len = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    i += 2 + len;
  }
  return null;
}

/** YouTube answers some missing sizes with a 120×90 grey placeholder instead of a 404. */
const PLACEHOLDER_MAX_WIDTH = 120;

/**
 * Best available thumbnail: maxres → sd → hq → mq → default (or from `quality` down),
 * skipping sizes YouTube doesn't have — both 404s and its 120px placeholder images.
 */
export async function fetchThumbnail(
  fetchFn: FetchFn,
  id: string,
  opts: Pick<ThumbnailOptions, "quality" | "output" | "urlOnly"> & { filename?: string },
) {
  const start =
    opts.quality === "best" ? 0 : THUMB_SIZES.findIndex((s) => s.quality === opts.quality);
  for (const size of THUMB_SIZES.slice(start)) {
    const url = `https://i.ytimg.com/vi/${id}/${size.file}`;
    const res = await fetchFn(url);
    if (res.status === 404) continue;
    if (!res.ok) throw new CliError("NETWORK", `Thumbnail request failed: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const real = jpegSize(bytes);
    if (size.quality !== "default" && real && real.width <= PLACEHOLDER_MAX_WIDTH) continue;
    const base = {
      id,
      quality: size.quality,
      url,
      width: real?.width ?? size.width,
      height: real?.height ?? size.height,
    };
    if (opts.urlOnly) return { ...base, path: null, sizeBytes: null };
    const path = join(opts.output, opts.filename ?? `${id}.jpg`);
    writeFileSync(path, bytes);
    return { ...base, path, sizeBytes: bytes.length };
  }
  throw new CliError("NOT_FOUND", `No thumbnail for video ${id}`, "Check the video id");
}
