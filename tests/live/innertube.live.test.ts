// Same scenarios against real YouTube. Opt-in: YT_DATA_LIVE=1 bun test
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { CliError, type ErrorCode } from "../../src/core/errors.ts";
import { createFetch } from "../../src/core/http.ts";
import { Channel } from "../../src/models/channel.ts";
import { SearchResult } from "../../src/models/search.ts";
import { Transcript, Video, VideoSummary } from "../../src/models/video.ts";
import { createInnertube, InnertubeSource } from "../../src/sources/innertube.ts";
import { SCENARIOS } from "../helpers/scenarios.ts";

const live = process.env.YT_DATA_LIVE === "1";

const List = z.array(VideoSummary.strict()).min(1);

const EXPECT: Record<string, { schema?: z.ZodType; error?: ErrorCode }> = {
  "channel-mkbhd": { schema: Channel.strict() },
  "channel-by-id": { schema: Channel.strict() },
  "channel-missing-handle": { error: "NOT_FOUND" },
  "video-rickroll": { schema: Video.strict() },
  "video-chapters": { schema: Video.strict() },
  "video-age-restricted": { schema: Video.strict() },
  "video-missing": { error: "NOT_FOUND" },
  "list-videos": { schema: List },
  "list-shorts": { schema: List },
  "list-streams": { schema: List },
  "list-popular": { schema: List },
  "list-all": { schema: List },
  "list-playlist": { schema: List },
  "search-videos": { schema: z.array(SearchResult).min(1) },
  "search-channels": { schema: z.array(SearchResult).min(1) },
  "search-playlists": { schema: z.array(SearchResult).min(1) },
  "search-shorts": { schema: z.array(SearchResult).min(1) },
  "transcript-manual": { schema: Transcript.strict() },
  "transcript-auto": { schema: Transcript.strict() },
  "transcript-other-lang": { schema: Transcript.strict() },
  "transcript-missing-lang": { error: "NOT_FOUND" },
};

describe.skipIf(!live)("live InnerTube", () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async () => {
      const fetch = createFetch();
      const source = new InnertubeSource(await createInnertube({ region: "US", fetch }));
      const want = EXPECT[scenario.name];
      if (!want) throw new Error(`no expectation for ${scenario.name}`);
      if (want.error) {
        const err = await scenario.run(source, fetch).catch((e) => e);
        expect(err).toBeInstanceOf(CliError);
        if ((err as CliError).code === "RATE_LIMITED" && want.error !== "RATE_LIMITED") {
          console.warn(`${scenario.name}: inconclusive, ${(err as CliError).message}`);
          return;
        }
        expect((err as CliError).code).toBe(want.error);
      } else {
        let result: unknown;
        try {
          result = await scenario.run(source, fetch);
        } catch (err) {
          // Datacenter IPs (CI runners) regularly get bot-checked; that says nothing about
          // whether our parsing still works, so report it instead of failing.
          if (err instanceof CliError && err.code === "RATE_LIMITED") {
            console.warn(`${scenario.name}: inconclusive, ${err.message}`);
            return;
          }
          throw err;
        }
        want.schema?.parse(result);
      }
    }, 30_000);
  }
});
