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
  streamPercent,
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

test("fragmented stream: a tiny first estimate doesn't lock the bar at 80% (regression)", () => {
  // Real lines from video 4EZDqbIA2Ek (HLS format 616 + audio 140-20).
  const t = new ProgressTracker(false);
  const seen: number[] = [];
  for (const line of [
    "TUBELINE_FMT 616+140-20",
    "TUBELINE_PROG 616|downloading|712|NA|712|1163.08|NA|1|131",
    "TUBELINE_PROG 616|downloading|712|NA|186544.0|1163.08|NA|1|131",
    "TUBELINE_PROG 616|downloading|625247|NA|81860721.0|900000|NA|2|131",
    "TUBELINE_PROG 616|downloading|13131885|NA|122857760.5|3000000|40|13|131",
    "TUBELINE_PROG 616|downloading|44209152|NA|144696773.7|3000000|30|39|131",
    "TUBELINE_PROG 616|downloading|113000000|NA|138000000|3100000|9|107|131",
    "TUBELINE_PROG 616|finished|138000000|NA|138000000|3100000|NA|131|131",
    "TUBELINE_PROG 140-20|downloading|1024|NA|2000000|NA|NA|1|25",
  ]) {
    seen.push(Math.floor(t.update(line).percent));
  }
  expect(seen[1]).toBe(0); // was 80 before the fix
  expect(seen[2]).toBe(0);
  expect(seen[4]).toBe(7); // fragment 13 of 131
  expect(seen[6]).toBe(65); // fragment 107 of 131
  expect(seen[7]).toBe(80); // video stream finished
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
  const p = t.update("TUBELINE_PROG 616|downloading|113000000|NA|138000000|3100000|9|107|131");
  expect(p.estimated).toBe(true);
});

test("streamPercent: fragments beat estimates; estimates never reach 100 early", () => {
  expect(streamPercent("downloading", 712, null, 712, 1, 131)).toBe(0);
  expect(streamPercent("downloading", 712, null, 712, null, null)).toBe(99);
  expect(streamPercent("downloading", 50, 100, null, null, null)).toBe(50);
  expect(streamPercent("finished", null, null, null, null, null)).toBe(100);
  expect(streamPercent("downloading", null, null, null, null, null)).toBeNull();
});
