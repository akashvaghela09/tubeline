// Drive the App in OpenTUI's in-memory test renderer.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../src/ui/app.tsx";
import { JobQueue } from "../../src/ui/jobs.ts";
import type { Prefs } from "../../src/ui/prefs.ts";
import { fakeServices } from "./fake.ts";

// savePrefs() writes ui.json under the data dir: never let tests touch the real one.
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), "yt-data-ui-home-"));

export async function harness(
  opts: Parameters<typeof fakeServices>[0] & {
    width?: number;
    height?: number;
    prefs?: Partial<Prefs>;
  } = {},
) {
  const { services, log } = fakeServices(opts);
  const tmp = mkdtempSync(join(tmpdir(), "yt-data-ui-"));
  const prefs: Prefs = {
    recent: [],
    recentDirs: [],
    theme: "night",
    downloadDir: join(tmp, "dl"),
    videoQuality: "best",
    audioFormat: "mp3",
    transcriptFormat: "txt",
    transcriptDir: join(tmp, "tr"),
    thumbnailDir: join(tmp, "th"),
    ...opts.prefs,
  };
  const jobs = new JobQueue(services);
  let quit = false;
  const t = await testRender(
    <App services={services} prefs={prefs} jobs={jobs} onQuit={() => (quit = true)} />,
    {
      width: opts.width ?? 100,
      height: opts.height ?? 30,
      exitOnCtrlC: false,
    },
  );
  // Async effects (fake services resolving) update state outside act(); that's expected here.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
      await t.renderOnce();
    }
  };
  await settle();
  return {
    log,
    prefs,
    jobs,
    get quit() {
      return quit;
    },
    frame: () => t.captureCharFrame(),
    async type(text: string) {
      await act(async () => {
        await t.mockInput.typeText(text);
      });
      await settle();
    },
    async key(
      k: Parameters<typeof t.mockInput.pressKey>[0],
      mods?: Parameters<typeof t.mockInput.pressKey>[1],
    ) {
      await act(async () => {
        t.mockInput.pressKey(k, mods);
      });
      await settle();
    },
    async enter() {
      await act(async () => {
        t.mockInput.pressEnter();
      });
      await settle();
    },
    async esc() {
      await act(async () => {
        t.mockInput.pressEscape();
      });
      await settle();
    },
    settle,
    destroy: () => {
      t.renderer.destroy();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
