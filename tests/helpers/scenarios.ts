// Fixture scenarios shared by the recorder, contract tests and live tests.
import { parseRef } from "../../src/core/resolve.ts";
import type { InnertubeSource } from "../../src/sources/innertube.ts";

export interface Scenario {
  name: string;
  run: (source: InnertubeSource) => Promise<unknown>;
}

export const SCENARIOS: Scenario[] = [
  { name: "channel-mkbhd", run: (s) => s.getChannel(parseRef("@mkbhd")) },
  { name: "channel-by-id", run: (s) => s.getChannel(parseRef("UCXuqSBlHAE6Xw-yeJA0Tunw")) },
  {
    name: "channel-missing-handle",
    run: (s) => s.getChannel(parseRef("@thishandledoesnotexist-zz9q")),
  },
  { name: "video-rickroll", run: (s) => s.getVideo("dQw4w9WgXcQ") },
  { name: "video-chapters", run: (s) => s.getVideo("pOX1l1edBME") },
  { name: "video-age-restricted", run: (s) => s.getVideo("HtVdAasjOgU") },
  { name: "video-missing", run: (s) => s.getVideo("aaaaaaaaaaa") },
];
