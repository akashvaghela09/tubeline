import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Command, Option } from "commander";
import { TEXT_FORMATS, type TextFormat, toSrt, toTxt, toVtt } from "../core/captions.ts";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { parseRef, refKindLabel } from "../core/resolve.ts";
import { expandRefs, runForRefs } from "../core/run.ts";
import type { Transcript } from "../models/video.ts";
import { getTranscript, type Prefer } from "../services/transcript.ts";

interface TranscriptOptions {
  lang?: string;
  prefer: Prefer;
  as: TextFormat;
  timestamps?: boolean;
  list?: boolean;
  output?: string;
  fallback: boolean;
  fields?: string;
}

export function registerTranscript(program: Command, getCtx: () => AppContext) {
  program
    .command("transcript")
    .summary("captions / transcript of a video")
    .description(
      "Fetch a video's transcript from its captions (manual or auto-generated). Falls back to yt-dlp when InnerTube fails or the language only exists as a YouTube machine translation.",
    )
    .argument("<refs...>", "video URL or id, or - to read refs from stdin")
    .option(
      "-l, --lang <code>",
      "caption language (default: English if available, else the first track)",
    )
    .addOption(
      new Option("--prefer <kind>", "prefer manual or auto-generated captions")
        .choices(["manual", "auto"])
        .default("manual"),
    )
    .addOption(
      new Option("--as <fmt>", "output format of the transcript")
        .choices(TEXT_FORMATS)
        .default("json"),
    )
    .option("--timestamps", "prefix each line with [mm:ss] (with --as txt)")
    .option("--list", "list available caption tracks instead")
    .option(
      "-o, --output <path>",
      "write to this file (one ref) or directory (several refs) instead of stdout",
    )
    .option("--no-fallback", "don't fall back to yt-dlp")
    .option("--fields <list>", "comma-separated fields to keep (with --as json)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data transcript dQw4w9WgXcQ --as txt
  yt-data transcript dQw4w9WgXcQ --as txt --timestamps
  yt-data transcript https://youtu.be/dQw4w9WgXcQ --lang de --as srt -o rick.de.srt
  yt-data transcript dQw4w9WgXcQ --list
  yt-data videos @mkbhd -n 5 -f ndjson --fields id | jq -r .id | yt-data transcript - --as txt -o ./transcripts

JSON output: {videoId, lang, name, isAuto, isTranslated, source, segments[{start, duration, text}]}.
With -o, stdout gets one JSON record per file written: {videoId, lang, path}.`,
    )
    .action(async (refs: string[], opts: TranscriptOptions) => {
      const ctx = getCtx();
      const videoId = (ref: string) => {
        const parsed = parseRef(ref);
        if (parsed.kind !== "video")
          throw new CliError("USAGE", `"${ref}" is a ${refKindLabel(parsed)}, not a video`);
        return parsed.id;
      };

      if (opts.list) {
        await runForRefs(ctx, refs, opts, async (ref) => {
          const id = videoId(ref);
          const tracks = await (await ctx.innertube()).getCaptionTracks(id);
          return { videoId: id, tracks: tracks.map(({ baseUrl: _, ...t }) => t) };
        });
        return;
      }

      const expanded = await expandRefs(refs);
      const many = expanded.length > 1 || refs.includes("-");
      if (many && !opts.output && opts.as !== "json") {
        throw new CliError(
          "USAGE",
          `--as ${opts.as} with several videos needs -o <dir>`,
          "Or use --as json",
        );
      }
      const fetchOne = async (ref: string) => {
        const id = videoId(ref);
        return getTranscript(
          {
            source: await ctx.innertube(),
            fetch: ctx.fetch,
            cache: ctx.cache,
            ytdlp: opts.fallback ? ctx.ytdlp : false,
          },
          id,
          { lang: opts.lang, prefer: opts.prefer },
        );
      };

      if (opts.output) {
        const out = opts.output;
        if (many) mkdirSync(out, { recursive: true });
        await runForRefs(ctx, expanded, { ...opts, fields: undefined }, async (ref) => {
          const t = await fetchOne(ref);
          const path = many ? join(out, `${t.videoId}.${t.lang}.${opts.as}`) : out;
          writeFileSync(path, renderTranscript(t, opts));
          return { videoId: t.videoId, lang: t.lang, path };
        });
        return;
      }

      if (opts.as === "json") {
        await runForRefs(ctx, refs, opts, fetchOne);
        return;
      }
      const t = await fetchOne(expanded[0] as string);
      process.stdout.write(renderTranscript(t, opts));
    });
}

function renderTranscript(
  t: Transcript,
  opts: Pick<TranscriptOptions, "as" | "timestamps">,
): string {
  switch (opts.as) {
    case "txt":
      return toTxt(t.segments, opts.timestamps);
    case "vtt":
      return toVtt(t.segments);
    case "srt":
      return toSrt(t.segments);
    case "json":
      return `${JSON.stringify(t)}\n`;
  }
}
