import { type Command, Option } from "commander";
import type { AppContext } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { searchHuman } from "../core/human.ts";
import { createListWriter, parseFields } from "../core/output.ts";
import {
  SEARCH_DURATIONS,
  SEARCH_FEATURES,
  SEARCH_SORTS,
  SEARCH_TYPES,
  SEARCH_UPLOADED,
  type SearchOptions,
} from "../sources/innertube.ts";

interface SearchCliOptions {
  type: SearchOptions["type"];
  sort?: SearchOptions["sort"];
  duration?: SearchOptions["duration"];
  uploaded?: SearchOptions["uploaded"];
  features?: string;
  limit: string;
  fields?: string;
}

export function registerSearch(program: Command, getCtx: () => AppContext) {
  program
    .command("search")
    .summary("search YouTube for videos, channels or playlists")
    .description("Search YouTube. Results carry the same ids and URLs the other commands accept.")
    .argument("<query...>", "search terms")
    .addOption(
      new Option("-t, --type <type>", "what to search for").choices(SEARCH_TYPES).default("video"),
    )
    .addOption(
      new Option("-s, --sort <order>", "result order (default relevance)").choices(SEARCH_SORTS),
    )
    .addOption(
      new Option(
        "--duration <d>",
        "video length: short (<3 min), medium (3–20), long (>20)",
      ).choices(Object.keys(SEARCH_DURATIONS)),
    )
    .addOption(new Option("--uploaded <when>", "upload date filter").choices(SEARCH_UPLOADED))
    .option("--features <list>", `comma-separated: ${SEARCH_FEATURES.join(", ")}`)
    .option("-n, --limit <n>", "maximum number of results; 0 = all pages", "20")
    .option("--fields <list>", "comma-separated fields to keep (dot paths allowed)")
    .addHelpText(
      "after",
      `
Examples:
  yt-data search mkbhd iphone review
  yt-data search "lofi hip hop" --type playlist -n 5
  yt-data search mkbhd --type channel --fields id,name,subscriberCount
  yt-data search "rust tutorial" --duration long --uploaded year --sort popularity
  yt-data search "cat videos" --type shorts --json | jq -r '.[].id'

Each result has a "type" (video, channel, playlist) deciding its fields:
  yt-data schema search`,
    )
    .action(async (words: string[], opts: SearchCliOptions) => {
      const ctx = getCtx();
      const query = words.join(" ").trim();
      if (!query) throw new CliError("USAGE", "Empty search query");
      const limit = Number(opts.limit);
      if (!Number.isInteger(limit) || limit < 0) {
        throw new CliError("USAGE", `--limit must be a non-negative integer, got "${opts.limit}"`);
      }
      const features =
        opts.features
          ?.split(",")
          .map((f) => f.trim())
          .filter(Boolean) ?? [];
      const unknown = features.filter((f) => !(SEARCH_FEATURES as readonly string[]).includes(f));
      if (unknown.length) {
        throw new CliError(
          "USAGE",
          `Unknown --features: ${unknown.join(", ")}`,
          `Use: ${SEARCH_FEATURES.join(", ")}`,
        );
      }

      const writer = createListWriter({
        format: ctx.config.format,
        fields: parseFields(opts.fields),
        pretty: process.stdout.isTTY,
        human: searchHuman,
      });
      const source = await ctx.innertube();
      let count = 0;
      for await (const item of source.search(query, {
        type: opts.type,
        sort: opts.sort,
        duration: opts.duration,
        uploaded: opts.uploaded,
        features: features as SearchOptions["features"],
      })) {
        writer.write(item);
        if (limit && ++count >= limit) break;
      }
      writer.end();
    });
}
