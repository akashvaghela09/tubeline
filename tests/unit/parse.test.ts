import { describe, expect, test } from "bun:test";
import {
  handleFromUrl,
  parseClock,
  parseCount,
  parseDescriptionChapters,
  parseDisplayDate,
  parseRelativeAge,
  parseSince,
  toUtcIso,
  unwrapRedirect,
} from "../../src/core/parse.ts";

describe("parseCount", () => {
  test.each([
    ["21.3M subscribers", 21_300_000],
    ["1.8K videos", 1_800],
    ["5,728,713,104 views", 5_728_713_104],
    ["1,855 videos", 1_855],
    ["1 subscriber", 1],
    ["8.9K", 8_900],
    ["2.4M", 2_400_000],
    ["1.2B views", 1_200_000_000],
    ["No views", 0],
    ["3 months ago", 3],
  ])("%s → %d", (text, n) => {
    expect(parseCount(text)).toBe(n);
  });

  test.each([null, undefined, "", "views"])("%p → null", (text) => {
    expect(parseCount(text)).toBeNull();
  });
});

test("parseDisplayDate", () => {
  expect(parseDisplayDate("Joined Mar 21, 2008")).toBe("2008-03-21");
  expect(parseDisplayDate("Sep 5, 2024")).toBe("2024-09-05");
  expect(parseDisplayDate("September 5, 2024")).toBe("2024-09-05");
  expect(parseDisplayDate("yesterday")).toBeNull();
  expect(parseDisplayDate(undefined)).toBeNull();
});

test("toUtcIso", () => {
  expect(toUtcIso("2009-10-24T23:57:33-07:00")).toBe("2009-10-25T06:57:33.000Z");
  expect(toUtcIso("garbage")).toBeNull();
  expect(toUtcIso(null)).toBeNull();
});

test("parseClock", () => {
  expect(parseClock("12:23")).toBe(743);
  expect(parseClock("1:02:03")).toBe(3723);
  expect(parseClock("0:00")).toBe(0);
  expect(parseClock("abc")).toBeNull();
});

test("handleFromUrl", () => {
  expect(handleFromUrl("http://www.youtube.com/@mkbhd")).toBe("@mkbhd");
  expect(handleFromUrl("https://www.youtube.com/@mkbhd/videos")).toBe("@mkbhd");
  expect(handleFromUrl("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ")).toBeNull();
});

test("unwrapRedirect", () => {
  expect(
    unwrapRedirect("https://www.youtube.com/redirect?event=x&q=http%3A%2F%2Ftwitter.com%2FMKBHD"),
  ).toBe("http://twitter.com/MKBHD");
  expect(unwrapRedirect("https://example.com/a")).toBe("https://example.com/a");
});

describe("parseDescriptionChapters", () => {
  test("parses timestamped lines", () => {
    const desc = "Intro text\n0:00 Intro\n1:30 - Design\n(12:05) Battery\n1:02:03 Verdict\nOutro";
    expect(parseDescriptionChapters(desc)).toEqual([
      { title: "Intro", startSeconds: 0 },
      { title: "Design", startSeconds: 90 },
      { title: "Battery", startSeconds: 725 },
      { title: "Verdict", startSeconds: 3723 },
    ]);
  });

  test("requires a 0:00 start and at least 3 chapters", () => {
    expect(parseDescriptionChapters("0:30 A\n1:00 B\n2:00 C")).toEqual([]);
    expect(parseDescriptionChapters("0:00 A\n1:00 B")).toEqual([]);
    expect(parseDescriptionChapters(null)).toEqual([]);
  });
});

describe("parseRelativeAge", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  test.each([
    ["2d ago", "2026-09-29T00:00:00.000Z"],
    ["3 weeks ago", "2026-09-10T00:00:00.000Z"],
    ["Streamed 1y ago", "2025-10-01T00:00:00.000Z"],
    ["5mo ago", "2026-05-04T00:00:00.000Z"],
    ["1 hour ago", "2026-09-30T23:00:00.000Z"],
    ["10 minutes ago", "2026-09-30T23:50:00.000Z"],
  ])("%s", (text, iso) => {
    expect(parseRelativeAge(text, now)).toBe(iso);
  });

  test.each([null, "Scheduled for 10/5/26", "2d", "yesterday"])("%p → null", (text) => {
    expect(parseRelativeAge(text, now)).toBeNull();
  });
});

describe("parseSince", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  test("relative spans", () => {
    expect(parseSince("30d", now)?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseSince("2w", now)?.toISOString()).toBe("2026-09-17T00:00:00.000Z");
    expect(parseSince("1y", now)?.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });
  test("ISO dates", () => {
    expect(parseSince("2026-01-15", now)?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(parseSince("2026-01-15T12:00:00Z", now)?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });
  test.each(["yesterday", "30", "5x", "2026-13-45"])("rejects %p", (v) => {
    expect(parseSince(v, now)).toBeNull();
  });
});
