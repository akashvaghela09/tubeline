import { z } from "zod";
import { Image } from "./common.ts";

export const VideoSearchResult = z.object({
  type: z.literal("video"),
  id: z.string(),
  url: z.url(),
  title: z.string(),
  channel: z.object({
    id: z.string().nullable(),
    name: z.string(),
    handle: z.string().nullable(),
    isVerified: z.boolean(),
  }),
  durationSeconds: z.number().int().nullable(),
  viewCount: z.number().int().nullable(),
  viewCountText: z.string().nullable(),
  publishedText: z.string().nullable(),
  publishedAtApprox: z.iso.datetime().nullable(),
  isLive: z.boolean(),
  isUpcoming: z.boolean(),
  isShort: z.boolean(),
  description: z.string().describe("Snippet shown in results"),
  thumbnail: Image.nullable(),
});

export const ChannelSearchResult = z.object({
  type: z.literal("channel"),
  id: z.string(),
  url: z.url(),
  name: z.string(),
  handle: z.string().nullable(),
  subscriberCount: z.number().int().nullable(),
  subscriberCountText: z.string().nullable(),
  videoCount: z.number().int().nullable(),
  isVerified: z.boolean(),
  description: z.string(),
  avatar: Image.nullable(),
});

export const PlaylistSearchResult = z.object({
  type: z.literal("playlist"),
  id: z.string(),
  url: z.url(),
  title: z.string(),
  channelName: z.string().nullable(),
  videoCount: z.number().int().nullable(),
  updatedText: z.string().nullable(),
  thumbnail: Image.nullable(),
});

export const SearchResult = z
  .discriminatedUnion("type", [VideoSearchResult, ChannelSearchResult, PlaylistSearchResult])
  .describe("One search result; `type` tells which fields are present");
export type SearchResult = z.infer<typeof SearchResult>;
