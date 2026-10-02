import { z } from "zod";
import { Image } from "./common.ts";

export const CaptionTrack = z.object({
  lang: z.string().describe("BCP-47 language code"),
  name: z.string(),
  isAuto: z.boolean().describe("Auto-generated (ASR) captions"),
  isTranslatable: z.boolean(),
});

export const Chapter = z.object({
  title: z.string(),
  startSeconds: z.number().int(),
});

export const Video = z
  .object({
    id: z.string(),
    url: z.url(),
    title: z.string(),
    description: z.string(),
    durationSeconds: z.number().int().nullable(),
    viewCount: z.number().int().nullable(),
    likeCount: z.number().int().nullable(),
    commentCount: z
      .number()
      .int()
      .nullable()
      .describe("Approximate when commentCountText is abbreviated"),
    commentCountText: z.string().nullable(),
    publishedAt: z.iso.datetime().nullable().describe("ISO-8601 UTC"),
    uploadedAt: z.iso.datetime().nullable().describe("ISO-8601 UTC"),
    channel: z.object({
      id: z.string(),
      name: z.string(),
      handle: z.string().nullable(),
      url: z.url(),
      subscriberCount: z.number().int().nullable(),
      subscriberCountText: z.string().nullable(),
      isVerified: z.boolean(),
    }),
    category: z.string().nullable(),
    keywords: z.array(z.string()),
    isLive: z.boolean(),
    isLiveContent: z.boolean().describe("Was (or is) a live stream"),
    isUpcoming: z.boolean(),
    isUnlisted: z.boolean().nullable(),
    isFamilySafe: z.boolean().nullable(),
    thumbnails: z.array(Image),
    captions: z.array(CaptionTrack),
    chapters: z.array(Chapter),
    playability: z
      .object({
        status: z.string().describe('"OK", "LOGIN_REQUIRED" (age/private), "UNPLAYABLE", …'),
        reason: z.string().nullable(),
      })
      .describe("Whether the video can be played/downloaded without sign-in"),
  })
  .describe("Full YouTube video metadata");
export type Video = z.infer<typeof Video>;
