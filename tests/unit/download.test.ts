import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError } from "../../src/core/errors.ts";
import {
  formatArgs,
  ProgressTracker,
  removePartials,
  splitArgs,
} from "../../src/services/download.ts";

test("formatArgs with ffmpeg", () => {
  expect(formatArgs("best", "m4a", true).args).toEqual([
    "-f",
    "bv*+ba/b",
    "-S",
    "ext",
    "--merge-output-format",
    "mp4/mkv",
  ]);
  expect(formatArgs("1080p", "m4a", true).args.slice(0, 2)).toEqual([
    "-f",
    "bv*[height<=1080]+ba/b[height<=1080]",
  ]);
  expect(formatArgs("audio", "mp3", true).args).toEqual([
    "-f",
    "ba/b",
    "-x",
    "--audio-format",
    "mp3",
  ]);
});

test("formatArgs without ffmpeg degrades or refuses", () => {
  const video = formatArgs("1080p", "m4a", false);
  expect(video.args).toEqual(["-f", "b[height<=1080]/b"]);
  expect(video.warning).toContain("ffmpeg");
  expect(formatArgs("audio", "m4a", false).args).toEqual(["-f", "ba[ext=m4a]/ba"]);
  expect(() => formatArgs("audio", "mp3", false)).toThrow(CliError);
});

test("splitArgs honours quotes", () => {
  expect(splitArgs(`--limit-rate 2M --referer "https://a b" -o 'x y'`)).toEqual([
    "--limit-rate",
    "2M",
    "--referer",
    "https://a b",
    "-o",
    "x y",
  ]);
});

test("ProgressTracker: one monotonic bar across video, audio and merge", () => {
  const t = new ProgressTracker(false);
  const seen: number[] = [];
  const stages: string[] = [];
  for (const line of [
    "TUBELINE_FMT 395+251",
    "TUBELINE_PROG 395|downloading|1024|200000|NA|NA|NA",
    "TUBELINE_PROG 395|downloading|100000|200000|NA|5000000|3",
    "TUBELINE_PROG 395|finished|200000|200000|NA|3000000|NA",
    "TUBELINE_PROG 251|downloading|1024|50000|NA|NA|NA",
    "TUBELINE_PROG 251|finished|50000|50000|NA|2000000|NA",
    "TUBELINE_POST Merger|started",
    "TUBELINE_POST Merger|finished",
  ]) {
    const p = t.update(line);
    seen.push(Math.round(p.percent));
    stages.push(`${p.stage}:${p.stream}/${p.streams}`);
  }
  expect(seen).toEqual([0, 0, 40, 81, 81, 95, 95, 95]);
  expect(stages).toEqual([
    "preparing:0/2",
    "downloading:1/2",
    "downloading:1/2",
    "downloading:1/2",
    "downloading:2/2",
    "downloading:2/2",
    "merging:2/2",
    "merging:2/2",
  ]);
  expect(t.alreadyDownloaded).toBe(false);
  expect(t.finish().percent).toBe(100);
});

test("ProgressTracker: bytes, speed, ETA and audio conversion", () => {
  const t = new ProgressTracker(true);
  t.update("TUBELINE_FMT 251");
  expect(t.update("TUBELINE_PROG 251|downloading|50|NA|100|2048|7")).toMatchObject({
    downloadedBytes: 50,
    totalBytes: 100,
    speed: 2048,
    eta: 7,
    streamPercent: 50,
  });
  expect(t.update("TUBELINE_POST ExtractAudio|started").stage).toBe("converting");
});

test("ProgressTracker notices already-downloaded files (no bytes transferred)", () => {
  const t = new ProgressTracker(false);
  t.update("TUBELINE_FMT 18");
  expect(t.alreadyDownloaded).toBe(true);
});

test("removePartials deletes only this id's leftovers", () => {
  const dir = mkdtempSync(join(tmpdir(), "tubeline-partials-"));
  for (const f of [
    "T [abc].f398.mp4.part",
    "T [abc].f140.m4a",
    "T [abc].mp4.ytdl",
    "T [abc].mp4",
    "Other [xyz].mp4.part",
  ]) {
    writeFileSync(join(dir, f), "");
  }
  expect(removePartials(dir, "abc")).toBe(3);
  expect(readdirSync(dir).sort()).toEqual(["Other [xyz].mp4.part", "T [abc].mp4"]);
});
