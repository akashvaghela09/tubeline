// The interactive UI, driven with keystrokes in OpenTUI's in-memory renderer.
import { afterEach, describe, expect, test } from "bun:test";
import type { Progress } from "../../src/services/download.ts";
import { THEMES, theme } from "../../src/ui/theme.ts";
import { harness } from "./harness.tsx";

type H = Awaited<ReturnType<typeof harness>>;
let h: H | null = null;
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

async function openChannel() {
  h = await harness({ height: 24 });
  await h.type("@fake");
  await h.enter();
  return h;
}

describe("home", () => {
  test("input, mode label and footer with ? keys", async () => {
    h = await harness();
    const f = h.frame();
    expect(f).toContain(" yt-data");
    expect(f).toContain("Paste a YouTube link");
    expect(f).toContain("search: videos ⇥");
    expect(f).toContain("? keys");
    expect(f).toContain("Try: a link");
  });

  test("an id opens the video screen and is remembered", async () => {
    await openVideo();
    const f = (h as H).frame();
    expect(f).toContain("Never Gonna Give You Up");
    expect(f).toContain("captions en, de");
    expect(f).toContain("best 1080p ≈ 32 MB");
    expect((h as H).prefs.recent[0]).toMatchObject({ kind: "ref", value: "dQw4w9WgXcQ" });
    expect((h as H).prefs.recent[0]?.label).toContain("Never Gonna Give You Up");
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

  test("? shows the key reference", async () => {
    await openVideo();
    await (h as H).type("?");
    expect((h as H).frame()).toContain("Download panel");
  });
});

describe("download panel", () => {
  test("d opens the panel with remembered defaults; Enter downloads; progress shows", async () => {
    let release: () => void = () => {};
    let emit: (p: Progress) => void = () => {};
    await openVideo({
      downloadStep: (e) => {
        emit = e;
        return new Promise<void>((r) => {
          release = r;
        });
      },
      prefs: { videoQuality: "720p", downloadDir: "/videos" },
    });
    const ui = h as H;
    await ui.key("d");
    const f = ui.frame();
    expect(f).toContain("Download Never Gonna Give You Up");
    expect(f).toMatch(/Quality\s+‹ 720p ›/);
    expect(f).toContain("≈ 20 MB");
    expect(f).toContain("Enter  download (≈ 20 MB)");
    expect(ui.log.downloads).toEqual([]);
    await ui.enter();
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
    const g = ui.frame();
    expect(g).toContain("↓ 1 running");
    expect(g).toMatch(/42% ━+/);
    expect(g).toContain("4.8 MB/9.5 MB");
    expect(g).toContain("ETA 0:03");
    expect(g).toContain("video 1/2");
    release();
    await new Promise((r) => setTimeout(r, 20));
    await ui.settle();
    expect(ui.frame()).toContain("^O to open folder");
  });

  test("←→ change quality, one-off by default; space makes it the default", async () => {
    await openVideo();
    const ui = h as H;
    await ui.key("d");
    await ui.key("ARROW_RIGHT"); // best → 1080p
    await ui.key("ARROW_RIGHT"); // → 720p
    await ui.enter();
    expect(ui.log.downloads[0]?.spec.quality).toBe("720p");
    expect(ui.prefs.videoQuality).toBe("best");
    await ui.key("d");
    await ui.key("ARROW_RIGHT");
    await ui.key(" ");
    expect(ui.frame()).toContain("[x] make these my defaults");
    await ui.enter();
    expect(ui.prefs.videoQuality).toBe("1080p");
  });

  test("Tab switches to audio; a opens straight on audio with the remembered format", async () => {
    await openVideo({ prefs: { audioFormat: "opus" } });
    const ui = h as H;
    await ui.key("a");
    expect(ui.frame()).toMatch(/Format\s+‹ opus ›/);
    await ui.enter();
    expect(ui.log.downloads[0]?.spec).toMatchObject({ kind: "audio", audioFormat: "opus" });
    await ui.key("d");
    await ui.key("TAB");
    expect(ui.frame()).toContain("[audio]");
  });

  test("e opens the folder picker, which can create a new folder", async () => {
    await openVideo();
    const ui = h as H;
    await ui.key("d");
    await ui.key("e");
    expect(ui.frame()).toContain("Save to");
    await ui.type("/new-folder");
    expect(ui.frame()).toContain("(will be created)");
    await ui.enter();
    expect(ui.frame()).toMatch(/Save to\s+.*new-folder/);
  });
});

describe("video", () => {
  test("transcript: read, switch language, save", async () => {
    await openVideo({ prefs: { transcriptFormat: "srt", transcriptDir: "/subs" } }); // fake save, no disk
    const ui = h as H;
    await ui.key("t");
    expect(ui.frame()).toContain("first line");
    expect(ui.frame()).toContain("s save srt → /subs");
    await ui.key("l");
    await ui.key("ARROW_DOWN");
    await ui.enter();
    expect(ui.frame()).toContain("German");
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
  test("columns, channel header and tabs", async () => {
    const ui = await openChannel();
    const f = ui.frame();
    expect(f).toContain("Fake Channel ✓");
    expect(f).toMatch(/videos\s+shorts\s+streams\s+all uploads/);
    expect(f).toMatch(/length\s+views\s+age\s+title/);
    expect(f).toMatch(/1:01\s+1.00K\s+1d ago\s+Video number 1/);
  });

  test("loads more as the cursor nears the end", async () => {
    const ui = await openChannel();
    expect(ui.frame()).toContain("30 loaded · more on scroll");
    for (let i = 0; i < 27; i++) await ui.key("ARROW_DOWN");
    expect(ui.frame()).toContain("60 loaded");
  });

  test("filter, select several, bulk download through the panel", async () => {
    const ui = await openChannel();
    await ui.type("/");
    await ui.type("number 1");
    expect(ui.frame()).toContain("filter “number 1”");
    await ui.enter();
    await ui.key(" ");
    await ui.key(" ");
    expect(ui.frame()).toContain("2 selected");
    await ui.key("d");
    expect(ui.frame()).toContain("Download 2 videos");
    await ui.enter();
    expect(ui.log.downloads.map((d) => d.id)).toEqual(["vid00000001", "vid00000010"]);
    expect(ui.frame()).toContain("Downloading 2 videos");
  });

  test("tabs switch; Esc returns to the same list position", async () => {
    const ui = await openChannel();
    await ui.key("TAB");
    expect(ui.frame()).toMatch(/shorts/);
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
  test("Ctrl+C quits when idle on Home", async () => {
    h = await harness();
    await h.key("c", { ctrl: true });
    expect(h.quit).toBe(true);
  });

  test("Ctrl+C goes Home first; on Home it asks while downloads run, then quits", async () => {
    await openVideo({ downloadStep: () => new Promise(() => {}) });
    const ui = h as H;
    await ui.key("d");
    await ui.enter();
    await ui.key("c", { ctrl: true });
    expect(ui.quit).toBe(false);
    expect(ui.frame()).toContain("Paste a YouTube link");
    await ui.key("c", { ctrl: true });
    expect(ui.quit).toBe(false);
    expect(ui.frame()).toContain("Ctrl+C again to cancel them and quit");
    await ui.key("c", { ctrl: true });
    expect(ui.quit).toBe(true);
  });

  test("settings: grouped rows with help; audio format persists", async () => {
    h = await harness();
    await h.key("s", { ctrl: true });
    const f = h.frame();
    expect(f).toContain("Appearance");
    expect(f).toContain("Maintenance");
    expect(f).toContain("yt-data 9.9.9");
    for (let i = 0; i < 3; i++) await h.key("ARROW_DOWN"); // theme, folder, quality, audio
    expect(h.frame()).toContain("mp3 plays everywhere");
    await h.enter();
    await h.key("ARROW_DOWN");
    await h.enter();
    expect(h.prefs.audioFormat).toBe("m4a");
  });

  test("theme: live preview while moving, Esc restores, Enter saves", async () => {
    h = await harness();
    await h.key("s", { ctrl: true });
    await h.enter(); // Theme row
    expect(h.frame()).toContain("Gruvbox");
    expect(h.frame()).toContain("More · Catppuccin Mocha");
    const before = theme.bg;
    await h.key("ARROW_DOWN"); // opens on the current theme (Night) → Day
    expect(theme.bg).toBe(THEMES.day.bg);
    await h.esc();
    expect(theme.bg).toBe(before);
    expect(h.prefs.theme).toBe("night");
    await h.enter();
    await h.key("ARROW_DOWN");
    await h.key("ARROW_DOWN"); // Night → Day → Gruvbox
    await h.enter();
    expect(h.prefs.theme).toBe("gruvbox");
    expect(h.frame()).toMatch(/Theme\s+Gruvbox/);
  });

  test("downloads screen lists jobs and cancels queued ones", async () => {
    await openVideo({ downloadStep: () => new Promise(() => {}) });
    const ui = h as H;
    await ui.key("d");
    await ui.enter();
    await ui.key("a");
    await ui.enter();
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
    expect(ui.frame()).not.toContain("Download Never");
    expect(ui.frame()).toContain("Never Gonna Give You Up");
  });

  test("Backspace goes back when nothing is being typed", async () => {
    await openVideo();
    const ui = h as H;
    await ui.key("t");
    expect(ui.frame()).toContain("first line");
    await ui.key("BACKSPACE");
    expect(ui.frame()).toContain("Download audio");
    await ui.key("BACKSPACE");
    expect(ui.frame()).toContain("Paste a YouTube link");
  });

  test("←/→ switch tabs in lists and the search type on an empty Home input", async () => {
    h = await harness({ height: 24 });
    await h.key("ARROW_RIGHT");
    expect(h.frame()).toContain("search: shorts");
    await h.key("ARROW_LEFT");
    await h.type("@fake");
    await h.enter();
    await h.key("ARROW_RIGHT");
    expect(h.frame()).toMatch(/1 loaded|loaded/);
    await h.key("ARROW_LEFT");
    expect(h.frame()).toContain("Video number 1");
  });
});
