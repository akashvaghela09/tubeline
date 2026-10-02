// Re-records tests/fixtures/innertube/*.json.gz from live YouTube.
//   bun run scripts/record-fixtures.ts            # all scenarios
//   bun run scripts/record-fixtures.ts video-rickroll
// Recordings are anonymous (no cookies). Review `git diff --stat` before committing.
import { createInnertube, InnertubeSource } from "../src/sources/innertube.ts";
import { type Entry, recordingFetch, saveFixture } from "../tests/helpers/fixtures.ts";
import { SCENARIOS } from "../tests/helpers/scenarios.ts";

const only = new Set(process.argv.slice(2));

for (const scenario of SCENARIOS) {
  if (only.size && !only.has(scenario.name)) continue;
  const entries: Entry[] = [];
  const fetch = recordingFetch(entries);
  const yt = await createInnertube({ region: "US", fetch });
  let outcome = "ok";
  try {
    await scenario.run(new InnertubeSource(yt), fetch);
  } catch (err) {
    outcome = `error (${(err as Error).message})`;
  }
  saveFixture(scenario.name, entries);
  console.error(`${scenario.name}: ${entries.length} requests, ${outcome}`);
}
