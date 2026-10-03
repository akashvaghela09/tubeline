// The interactive UI, driven with keystrokes in OpenTUI's in-memory renderer.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Progress } from "../../src/services/download.ts";
import { harness } from "./harness.tsx";

type H = Awaited<ReturnType<typeof harness>>;
let h: H | null = null;
// savePrefs() writes ui.json; keep it out of the real data dir.
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), "yt-data-ui-data-"));
afterEach(() => {
  h?.destroy();
  h = null;
});

const progress = (p: Partial<Progress>): Progress => ({
  stage: "downloading",
  stream: 1,
  streams: 2,
  percent: 0,
  streamPercent: 0,
  totalBytes: null,
  downloadedBytes: null,
  speed: null,
  eta: null,
  line: "",
  ...p,
});

async function openVideo(opts: Parameters<typeof harness>[0] = {}) {
  h = await harness(opts);
  await h.type("dQw4w9WgXcQ");
  await h.enter();
  return h;
}

describe("home", () => {
  test("shows the input and hints", async () => {
    h = await harness();
    const f = h.frame();
    expect(f).toContain("yt-data 9.9.9");
    expect(f).toContain("Paste a YouTube link");
    expect(f).toContain("search: videos (Tab)");
    expect(f).toContain("^C quit");
  });

  test("an id opens the video screen and is remembered", async () => {
    await openVideo();
    const f = (h as H).frame();
    expect(f).toContain("Never Gonna Give You Up");
    expect(f).toContain("captions en, de");
    expect(f).toContain("best 1080p ≈ 32 MB");
    expect((h as H).prefs.recent[0]).toMatchObject({ kind: "ref", value: "dQw4w9WgXcQ" });
  });

  test("free text searches, Tab changes the type", async () => {
    h = await harness();
    await h.key("TAB");
    await h.key("TAB");
    expect(h.frame()).toContain("search: channels");
    await h.type("lofi beats");
    await h.enter();
    expect(h.log.searches).toEqual([{ query: "lofi beats", type: "channel" }]);
    expect(h.frame()).toContain("Search “lofi beats”");
  });

  test("a non-YouTube URL is explained, not searched", async () => {
    h = await harness();
    await h.type("https://vimeo.com/123");
    await h.enter();
    expect(h.frame()).toContain("isn't a YouTube link");
    expect(h.log.searches).toEqual([]);
  });
});

describe("video", () => {
  test("d queues a download with the remembered quality and folder, and shows progress", async () => {
    let release: () => void = () => {};
    let emit: (p: Progress) => void = () => {};
    await openVideo({
      downloadStep: (e) => {
        emit = e;
        return new Promise<void>((r) => {
          release = r;
        });
      },
      prefs: { videoQuality: "720p", downloadDir: "/videos" }, // fake download, no disk
    });
    const ui = h as H;
    await ui.key("d");
    expect(ui.log.downloads).toEqual([
      {
        id: "dQw4w9WgXcQ",
        spec: { kind: "video", quality: "720p", audioFormat: "mp3", dir: "/videos" },
      },
    ]);
    emit(
      progress({
        percent: 42,
        streamPercent: 50,
        downloadedBytes: 5_000_000,
        totalBytes: 10_000_000,
        speed: 2_000_000,
        eta: 3,
      }),
    );
    await new Promise((r) => setTimeout(r, 150));
    await ui.settle();
    const f = ui.frame();
    expect(f).toContain("1 running");
    expect(f).toMatch(/42% ━+/);
    expect(f).toContain("4.8 MB/9.5 MB");
    expect(f).toContain("ETA 0:03");
    expect(f).toContain("video 1/2");
    release();
    await new Promise((r) => setTimeout(r, 20));
    await ui.settle();
    expect(ui.frame()).toContain("1 done");
  });

  test("D asks quality (with sizes) and folder, remembers both", async () => {
    await openVideo();
    const ui = h as H;
    await ui.key("d", { shift: true });
    expect(ui.frame()).toContain("Download quality");
    expect(ui.frame()).toContain("≈ 20 MB");
    await ui.key("ARROW_DOWN"); // 1080p
    await ui.key("ARROW_DOWN"); // 720p
    await ui.enter();
    expect(ui.frame()).toContain("Save to");
    await ui.enter(); // keep the prefilled folder
    expect(ui.prefs.videoQuality).toBe("720p");
    expect(ui.log.downloads[0]?.spec).toMatchObject({ kind: "video", quality: "720p" });
  });

  test("a audio uses the remembered format", async () => {
    await openVideo({ prefs: { audioFormat: "opus" } });
    await (h as H).key("a");
    expect((h as H).log.downloads[0]?.spec).toMatchObject({ kind: "audio", audioFormat: "opus" });
  });

  test("transcript: read, switch language, save", async () => {
    await openVideo({ prefs: { transcriptFormat: "srt", transcriptDir: "/subs" } }); // fake save, no disk
    const ui = h as H;
    await ui.key("t");
    expect(ui.frame()).toContain("[00:01] first line");
    expect(ui.frame()).toContain("English · 2 lines");
    await ui.key("l");
    await ui.key("ARROW_DOWN");
    await ui.enter();
    expect(ui.frame()).toContain("German · 2 lines");
    await ui.key("s");
    expect(ui.log.transcripts).toEqual([{ id: "dQw4w9WgXcQ", format: "srt", dir: "/subs" }]);
    expect(ui.frame()).toContain("Saved /subs/dQw4w9WgXcQ.srt");
  });

  test("Esc goes back to home", async () => {
    await openVideo();
    await (h as H).esc();
    expect((h as H).frame()).toContain("Paste a YouTube link");
  });
});

describe("browse", () => {
  async function openChannel() {
    h = await harness({ height: 24 });
    await h.type("@fake");
    await h.enter();
    return h;
  }

  test("columns, channel header and tabs", async () => {
    const ui = await openChannel();
    const f = ui.frame();
    expect(f).toContain("Fake Channel ✓");
    expect(f).toContain("[videos]");
    expect(f).toMatch(/length\s+views\s+age\s+title/);
    expect(f).toMatch(/1:01\s+1K\s+1d ago\s+Video number 1/);
  });

  test("loads more as the cursor nears the end", async () => {
    const ui = await openChannel();
    expect(ui.frame()).toContain("30+ loaded");
    for (let i = 0; i < 27; i++) await ui.key("ARROW_DOWN");
    expect(ui.frame()).toContain("60+ loaded");
  });

  test("filter, select several, bulk download", async () => {
    const ui = await openChannel();
    await ui.type("/");
    await ui.type("number 1");
    expect(ui.frame()).toContain("filter “number 1”");
    await ui.enter();
    await ui.key(" ");
    await ui.key(" ");
    expect(ui.frame()).toContain("2 selected");
    await ui.key("d");
    expect(ui.log.downloads.map((d) => d.id)).toEqual(["vid00000001", "vid00000010"]);
    expect(ui.frame()).toContain("Queued 2 videos");
  });

  test("Tab switches channel tabs; Esc returns to the same list position", async () => {
    const ui = await openChannel();
    await ui.key("TAB");
    expect(ui.frame()).toContain("[shorts]");
    await ui.key("TAB", { shift: true });
    await ui.key("ARROW_DOWN");
    await ui.key("ARROW_DOWN");
    await ui.enter();
    expect(ui.frame()).toContain("Video vid00000003");
    await ui.esc();
    expect(ui.frame()).toMatch(/▸ .*Video number 3/);
  });
});

describe("app", () => {
  test("Ctrl+C quits when idle", async () => {
    h = await harness();
    await h.key("c", { ctrl: true });
    expect(h.quit).toBe(true);
  });

  test("Ctrl+C with a running download asks first", async () => {
    await openVideo({ downloadStep: () => new Promise(() => {}) });
    const ui = h as H;
    await ui.key("d");
    await ui.key("c", { ctrl: true });
    expect(ui.quit).toBe(false);
    expect(ui.frame()).toContain("Ctrl+C again to cancel them and quit");
    await ui.key("c", { ctrl: true });
    expect(ui.quit).toBe(true);
  });

  test("settings change and persist in prefs", async () => {
    h = await harness();
    await h.key("s", { ctrl: true });
    expect(h.frame()).toContain("Download folder");
    await h.key("ARROW_DOWN");
    await h.key("ARROW_DOWN");
    await h.enter();
    expect(h.frame()).toContain("Default audio format");
    await h.key("ARROW_DOWN");
    await h.enter();
    expect(h.prefs.audioFormat).toBe("m4a");
    expect(h.frame()).toMatch(/Audio format\s+m4a/);
  });

  test("downloads screen lists jobs and cancels queued ones", async () => {
    await openVideo({ downloadStep: () => new Promise(() => {}) });
    const ui = h as H;
    await ui.key("d");
    await ui.key("a");
    await ui.key("o", { ctrl: true });
    expect(ui.frame()).toContain("2 jobs this session");
    await ui.key("x");
    expect(ui.frame()).toContain("cancelled");
  });
});

describe("keys", () => {
  test("Ctrl+D (or any Ctrl/Alt combo) never triggers screen actions", async () => {
    await openVideo();
    const ui = h as H;
    await ui.key("d", { ctrl: true });
    await ui.key("a", { meta: true });
    expect(ui.log.downloads).toEqual([]);
    expect(ui.frame()).toContain("Never Gonna Give You Up");
  });
});
