import { describe, expect, test } from "bun:test";
import { CliError } from "../../src/core/errors.ts";
import { parseRef } from "../../src/core/resolve.ts";

const V = "dQw4w9WgXcQ";
const C = "UCBJycsmduvYEL83R_U4JriQ";

describe("parseRef", () => {
  test.each([
    [V, V],
    [`https://www.youtube.com/watch?v=${V}`, V],
    [`https://www.youtube.com/watch?v=${V}&t=42s&list=PL123456789`, V],
    [`youtube.com/watch?v=${V}`, V],
    [`https://m.youtube.com/watch?v=${V}`, V],
    [`https://music.youtube.com/watch?v=${V}`, V],
    [`https://youtu.be/${V}`, V],
    [`https://youtu.be/${V}?si=abc`, V],
    [`https://www.youtube.com/shorts/${V}`, V],
    [`https://www.youtube.com/live/${V}`, V],
    [`https://www.youtube.com/embed/${V}`, V],
    [`https://www.youtube-nocookie.com/embed/${V}`, V],
  ])("video: %s", (input, id) => {
    expect(parseRef(input)).toEqual({ kind: "video", id });
  });

  test.each([
    [C, C],
    [`https://www.youtube.com/channel/${C}`, C],
    [`https://www.youtube.com/channel/${C}/videos`, C],
  ])("channel id: %s", (input, id) => {
    expect(parseRef(input)).toEqual({ kind: "channel", id });
  });

  test.each([
    ["@mkbhd", "https://www.youtube.com/@mkbhd"],
    ["https://www.youtube.com/@mkbhd", "https://www.youtube.com/@mkbhd"],
    ["https://www.youtube.com/@mkbhd/videos", "https://www.youtube.com/@mkbhd"],
    ["www.youtube.com/c/LinusTechTips", "https://www.youtube.com/c/LinusTechTips"],
    [
      "https://www.youtube.com/user/marquesbrownlee",
      "https://www.youtube.com/user/marquesbrownlee",
    ],
  ])("channel url: %s", (input, url) => {
    expect(parseRef(input)).toEqual({ kind: "channelUrl", url });
  });

  test.each([
    ["PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI", "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"],
    [
      "https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
      "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    ],
  ])("playlist: %s", (input, id) => {
    expect(parseRef(input)).toEqual({ kind: "playlist", id });
  });

  test.each([
    "",
    "   ",
    "hello world",
    "not-a-ref",
    "https://vimeo.com/123",
    "https://youtu.be/short",
    "@",
  ])("rejects %p with USAGE", (input) => {
    try {
      parseRef(input);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe("USAGE");
    }
  });
});
