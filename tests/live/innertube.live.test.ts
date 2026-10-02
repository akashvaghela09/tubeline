// Same scenarios against real YouTube. Opt-in: YT_DATA_LIVE=1 bun test
import { describe, expect, test } from "bun:test";
import { CliError, type ErrorCode } from "../../src/core/errors.ts";
import { createFetch } from "../../src/core/http.ts";
import { Channel } from "../../src/models/channel.ts";
import { Video } from "../../src/models/video.ts";
import { createInnertube, InnertubeSource } from "../../src/sources/innertube.ts";
import { SCENARIOS } from "../helpers/scenarios.ts";

const live = process.env.YT_DATA_LIVE === "1";

const EXPECT: Record<string, { schema?: typeof Channel | typeof Video; error?: ErrorCode }> = {
  "channel-mkbhd": { schema: Channel },
  "channel-by-id": { schema: Channel },
  "channel-missing-handle": { error: "NOT_FOUND" },
  "video-rickroll": { schema: Video },
  "video-chapters": { schema: Video },
  "video-age-restricted": { schema: Video },
  "video-missing": { error: "NOT_FOUND" },
};

describe.skipIf(!live)("live InnerTube", () => {
  for (const scenario of SCENARIOS) {
    test(scenario.name, async () => {
      const source = new InnertubeSource(
        await createInnertube({ region: "US", fetch: createFetch() }),
      );
      const want = EXPECT[scenario.name];
      if (!want) throw new Error(`no expectation for ${scenario.name}`);
      if (want.error) {
        const err = await scenario.run(source).catch((e) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).code).toBe(want.error);
      } else {
        want.schema?.strict().parse(await scenario.run(source));
      }
    }, 30_000);
  }
});
