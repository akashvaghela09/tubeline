// End-to-end checks of the CLI process that need no network.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import pkg from "../../package.json";

const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, YT_DATA_CONFIG: "/nonexistent/config.json" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("cli", () => {
  test("--version", async () => {
    const r = await run("--version");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  test("--help goes to stdout and lists commands", async () => {
    const r = await run("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("channel");
    expect(r.stdout).toContain("video");
    expect(r.stdout).toContain("Exit codes");
  });

  test.each([
    [["channel", "--bogus"], "unknown option"],
    [["nope"], "unknown command"],
    [["channel"], "missing required argument"],
    [["--format", "xml", "channel", "@x"], "xml"],
    [["channel", "not a ref"], "Cannot parse"],
    [["video", "@mkbhd"], "is a channel, not a video"],
    [["channel", "dQw4w9WgXcQ"], "got a video"],
    [["videos", "dQw4w9WgXcQ"], "is a video"],
    [["videos", "@x", "--since", "yesterday"], "Invalid --since"],
    [["videos", "@x", "--limit", "abc"], "--limit"],
    [["videos", "@x", "--type", "reels"], "reels"],
    [["videos", "@x", "--type", "shorts", "--since", "30d"], "no dates"],
    [["videos", "@x", "--sort", "popular", "--since", "30d"], "newest-first"],
    [["transcript", "@mkbhd"], "not a video"],
    [["transcript", "dQw4w9WgXcQ", "e1q-TuHdc4Y", "--as", "txt"], "needs -o"],
    [["transcript", "dQw4w9WgXcQ", "--as", "pdf"], "pdf"],
    [["thumbnail", "@mkbhd", "--url-only"], "not a video"],
    [["thumbnail", "dQw4w9WgXcQ", "--quality", "huge"], "huge"],
  ])("usage error %p → exit 2 + JSON on stderr", async (args, fragment) => {
    const r = await run(...args);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    const line = JSON.parse(r.stderr.trim());
    expect(line.error.code).toBe("USAGE");
    expect(line.error.message).toContain(fragment);
  });
});
