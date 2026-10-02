// Runs the real InnerTube mapping against recorded responses and checks the output contract.
import { describe, expect, test } from "bun:test";
import { CliError, type ErrorCode } from "../../src/core/errors.ts";
import { parseRef } from "../../src/core/resolve.ts";
import { Channel } from "../../src/models/channel.ts";
import { Video } from "../../src/models/video.ts";
import { replaySource } from "../helpers/fixtures.ts";

async function expectError(promise: Promise<unknown>, code: ErrorCode) {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(CliError);
  expect((err as CliError).code).toBe(code);
}

describe("channel", () => {
  test("@mkbhd", async () => {
    const s = await replaySource("channel-mkbhd");
    const c = Channel.strict().parse(await s.getChannel(parseRef("@mkbhd")));
    expect(c).toMatchObject({
      id: "UCBJycsmduvYEL83R_U4JriQ",
      handle: "@mkbhd",
      name: "Marques Brownlee",
      url: "https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ",
      joinedAt: "2008-03-21",
      country: "United States",
      isVerified: true,
    });
    expect(c.subscriberCount).toBeGreaterThan(1_000_000);
    expect(c.subscriberCountText).toMatch(/subscribers/);
    expect(c.videoCount).toBeGreaterThan(1_000);
    expect(c.viewCount).toBeGreaterThan(1_000_000_000);
    expect(c.links.length).toBeGreaterThan(0);
    for (const l of c.links) expect(l.url).not.toContain("youtube.com/redirect");
    expect(c.avatar?.url).toStartWith("https://");
    expect(c.banner?.url).toStartWith("https://");
  });

  test("by UC id", async () => {
    const s = await replaySource("channel-by-id");
    const c = Channel.strict().parse(await s.getChannel(parseRef("UCXuqSBlHAE6Xw-yeJA0Tunw")));
    expect(c.handle).toBe("@LinusTechTips");
    expect(c.name).toBe("Linus Tech Tips");
  });

  test("missing handle → NOT_FOUND", async () => {
    const s = await replaySource("channel-missing-handle");
    await expectError(s.getChannel(parseRef("@thishandledoesnotexist-zz9q")), "NOT_FOUND");
  });
});

describe("video", () => {
  test("standard video", async () => {
    const s = await replaySource("video-rickroll");
    const v = Video.strict().parse(await s.getVideo("dQw4w9WgXcQ"));
    expect(v).toMatchObject({
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationSeconds: 213,
      publishedAt: "2009-10-25T06:57:33.000Z",
      category: "Music",
      isLive: false,
      channel: {
        id: "UCuAXFkgsw1L7xaCfnd5JJOw",
        name: "Rick Astley",
        handle: "@RickAstleyYT",
        isVerified: true,
      },
      playability: { status: "OK", reason: null },
    });
    expect(v.title).toContain("Never Gonna Give You Up");
    expect(v.viewCount).toBeGreaterThan(1_000_000_000);
    expect(v.likeCount).toBeGreaterThan(1_000_000);
    expect(v.commentCount).toBeGreaterThan(1_000_000);
    expect(v.captions.some((c) => c.lang === "en")).toBe(true);
    expect(v.thumbnails.length).toBeGreaterThan(0);
  });

  test("chapters from the player bar", async () => {
    const s = await replaySource("video-chapters");
    const v = Video.strict().parse(await s.getVideo("pOX1l1edBME"));
    expect(v.chapters.length).toBeGreaterThanOrEqual(3);
    expect(v.chapters[0]).toEqual({ title: "Apple Watch update overview", startSeconds: 0 });
    const starts = v.chapters.map((c) => c.startSeconds);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  test("age-restricted video still returns metadata", async () => {
    const s = await replaySource("video-age-restricted");
    const v = Video.strict().parse(await s.getVideo("HtVdAasjOgU"));
    expect(v.title).toContain("Witcher");
    expect(v.playability.status).toBe("LOGIN_REQUIRED");
  });

  test("missing video → NOT_FOUND", async () => {
    const s = await replaySource("video-missing");
    await expectError(s.getVideo("aaaaaaaaaaa"), "NOT_FOUND");
  });
});
