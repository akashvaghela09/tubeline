import { z } from "zod";
import { Image } from "./common.ts";

export const ChannelLink = z.object({
  title: z.string(),
  url: z.string(),
});

export const Channel = z
  .object({
    id: z.string().describe("Channel id (UC…)"),
    handle: z.string().nullable().describe("@handle, if the channel has one"),
    name: z.string(),
    description: z.string(),
    url: z.url(),
    subscriberCount: z
      .number()
      .int()
      .nullable()
      .describe("Parsed from subscriberCountText; approximate"),
    subscriberCountText: z.string().nullable().describe('As displayed, e.g. "21.3M subscribers"'),
    videoCount: z.number().int().nullable(),
    viewCount: z.number().int().nullable().describe("Total channel views"),
    joinedAt: z.iso.date().nullable().describe("YYYY-MM-DD"),
    country: z.string().nullable(),
    isVerified: z.boolean(),
    isFamilySafe: z.boolean().nullable(),
    keywords: z.array(z.string()),
    links: z.array(ChannelLink),
    avatar: Image.nullable(),
    banner: Image.nullable(),
    rssUrl: z.url().nullable(),
  })
  .describe("YouTube channel details");
export type Channel = z.infer<typeof Channel>;
