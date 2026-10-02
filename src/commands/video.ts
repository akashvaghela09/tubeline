import type { Command } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { parseRef, refKindLabel } from "../core/resolve.ts";
import { runForRefs } from "../core/run.ts";

export function registerVideo(program: Command, getCtx: () => AppContext) {
  program
    .command("video")
    .summary("full metadata for one or more videos")
    .description(
      "Fetch full video metadata: title, description, duration, view/like/comment counts, publish date, channel, keywords, category, thumbnails, caption tracks, chapters and playability.",
    )
    .argument(
      "<refs...>",
      "video URL (watch, youtu.be, shorts, live, embed), 11-char id, or - for stdin",
    )
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data video dQw4w9WgXcQ
  yt-data video https://youtu.be/dQw4w9WgXcQ --fields title,viewCount,publishedAt,channel.name
  cat ids.txt | yt-data video - --format ndjson

Output schema: yt-data schema video`,
    )
    .action(async (refs: string[], opts: { fields?: string }) => {
      const ctx = getCtx();
      await runForRefs(ctx, refs, opts, async (ref) => {
        const parsed = parseRef(ref);
        if (parsed.kind !== "video") {
          throw new CliError(
            "USAGE",
            `"${ref}" is a ${refKindLabel(parsed)}, not a video`,
            "Use `yt-data channel` for channels",
          );
        }
        return (await ctx.innertube()).getVideo(parsed.id);
      });
    });
}
