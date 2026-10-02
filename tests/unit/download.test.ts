import { expect, test } from "bun:test";
import { formatArgs, splitArgs } from "../../src/commands/download.ts";
import { CliError } from "../../src/core/errors.ts";

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
