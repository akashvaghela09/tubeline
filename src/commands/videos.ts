import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError, formatError, toCliError } from "../core/errors.ts";
import { videoHuman, videoListHuman } from "../core/human.ts";
import { createListWriter, parseFields } from "../core/output.ts";
import { parseSince } from "../core/parse.ts";
import { parseRef } from "../core/resolve.ts";
import type { Video, VideoSummary } from "../models/video.ts";
import { LIST_SORTS, LIST_TYPES, type ListSort, type ListType } from "../sources/innertube.ts";

interface VideosOptions {
  type: ListType;
  sort?: ListSort;
  limit: string;
  since?: string;
  full?: boolean;
  concurrency: string;
  fields?: string;
}

export function registerVideos(program: Command, getCtx: () => AppContext) {
  program
    .command("videos")
    .summary("list a channel's videos, shorts or streams, or a playlist")
    .description(
      "List videos from a channel tab or a playlist, following pagination. Listing items carry approximate counts and relative dates; --full fetches complete metadata (exact dates, likes, description) for each video.",
    )
    .argument("<ref>", "@handle, channel URL, UC… id, playlist URL or PL… id")
    .addOption(
      new Option("-t, --type <type>", "channel tab to list (all = every upload, newest first)")
        .choices(LIST_TYPES)
        .default("videos"),
    )
    .addOption(
      new Option("-s, --sort <order>", "sort order (channel tabs only; default newest)").choices(
        LIST_SORTS,
      ),
    )
    .option("-n, --limit <n>", "maximum number of videos; 0 = all", "50")
    .option("--since <when>", "stop at videos older than this: ISO date or 30d / 12w / 6mo / 1y")
    .option("--full", "fetch full metadata for every video (one extra request each, cached)")
    .option("--concurrency <n>", "parallel requests for --full", "4")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data videos @mkbhd --limit 10 --fields id,title,viewCount,publishedText
  yt-data videos @mkbhd --type shorts --sort popular -n 20
  yt-data videos @mkbhd --limit 0 --format ndjson > all.ndjson
  yt-data videos @mkbhd --since 30d --full --fields id,title,publishedAt,likeCount
  yt-data videos https://www.youtube.com/playlist?list=PLBsP89CPrMeO7uztAu6YxSB10cRMpjgiY

Without --full, --since uses dates estimated from "2d ago"-style text (accurate to about
one unit of it). Output is always a JSON array (or NDJSON lines with --format ndjson).
Output schema: yt-data schema videos (with --full: yt-data schema video)`,
    )
    .action(async (refArg: string, opts: VideosOptions) => {
      const ctx = getCtx();
      const limit = positiveInt(opts.limit, "--limit", true);
      const concurrency = positiveInt(opts.concurrency, "--concurrency", false);
      const fields = parseFields(opts.fields);

      let since: Date | undefined;
      if (opts.since) {
        since = parseSince(opts.since) ?? undefined;
        if (!since)
          throw new CliError(
            "USAGE",
            `Invalid --since "${opts.since}"`,
            "Use an ISO date or 30d / 12w / 6mo / 1y",
          );
        if (opts.sort && opts.sort !== "newest")
          throw new CliError("USAGE", "--since needs newest-first order");
        if (opts.type === "shorts" && !opts.full) {
          throw new CliError(
            "USAGE",
            "Shorts listings have no dates",
            "Add --full to filter shorts with --since",
          );
        }
      }

      const ref = parseRef(refArg);
      if (ref.kind === "video") {
        throw new CliError(
          "USAGE",
          `"${refArg}" is a video`,
          "Pass a channel or playlist; use `yt-data video` for one video",
        );
      }
      const source = await ctx.innertube();
      const writer = createListWriter({
        format: ctx.config.format,
        fields,
        pretty: process.stdout.isTTY,
        human: opts.full ? videoHuman : videoListHuman,
      });
      const items = source.listVideos(ref, { type: opts.type, sort: opts.sort });

      let emitted = 0;
      let firstError: CliError | undefined;
      const full = opts.full;
      /** Returns false once listing should stop. */
      const emit = (value: VideoSummary | Video, date: string | null): boolean => {
        if (since && date && new Date(date) < since) return false;
        writer.write(value);
        emitted++;
        return !(limit && emitted >= limit);
      };

      try {
        if (!full) {
          for await (const item of items) {
            if (!emit(item, item.publishedAtApprox)) break;
          }
        } else {
          // Fetch details in batches so output order matches listing order.
          let batch: VideoSummary[] = [];
          let open = true;
          const flush = async () => {
            const results = await Promise.all(
              batch.map((b) =>
                source.getVideo(b.id).then(
                  (v) => ({ ok: true as const, v }),
                  (e) => ({ ok: false as const, e, id: b.id }),
                ),
              ),
            );
            batch = [];
            for (const r of results) {
              if (!r.ok) {
                const err = toCliError(r.e);
                firstError ??= err;
                process.stderr.write(formatError(err, r.id));
                continue;
              }
              if (!emit(r.v, r.v.publishedAt)) return false;
            }
            return true;
          };
          for await (const item of items) {
            batch.push(item);
            const remaining = limit ? limit - emitted : Number.POSITIVE_INFINITY;
            if (batch.length >= Math.min(concurrency, remaining)) {
              open = await flush();
              if (!open) break;
            }
          }
          if (open && batch.length) await flush();
        }
      } catch (err) {
        // Keep whatever was already listed, but don't print an empty result for a failed lookup.
        if (emitted) writer.end();
        throw err;
      }
      writer.end();
      if (firstError) process.exitCode = firstError.exitCode;
    });
}

function positiveInt(value: string, flag: string, allowZero: boolean): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1)) {
    throw new CliError(
      "USAGE",
      `${flag} must be ${allowZero ? "a non-negative" : "a positive"} integer, got "${value}"`,
    );
  }
  return n;
}
