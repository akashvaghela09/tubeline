// Output shapes of the non-metadata commands, for `tubeline schema` and contract tests.
import { z } from "zod";
import { CaptionTrack } from "./video.ts";

export const ThumbnailResult = z
  .object({
    id: z.string(),
    quality: z.enum(["maxres", "sd", "hq", "mq", "default"]),
    url: z.url(),
    width: z.number().int(),
    height: z.number().int(),
    path: z.string().nullable().describe("null with --url-only"),
    sizeBytes: z.number().int().nullable(),
  })
  .describe("A downloaded (or located) thumbnail");

export const DownloadResult = z
  .object({
    id: z.string(),
    title: z.string(),
    path: z.string().describe("Absolute or output-relative path of the final file"),
    ext: z.string(),
    formatId: z.string().describe('yt-dlp format id(s), e.g. "137+140"'),
    resolution: z.string().describe('e.g. "1920x1080" or "audio only"'),
    sizeBytes: z.number().int().nullable(),
  })
  .describe("One file written by `download`");

export const CaptionTrackList = z
  .object({
    videoId: z.string(),
    tracks: z.array(CaptionTrack),
  })
  .describe("Output of `transcript --list`");

export const TranscriptFile = z
  .object({ videoId: z.string(), lang: z.string(), path: z.string() })
  .describe("Output of `transcript -o …`, one per file written");

export const DoctorReport = z
  .object({
    ok: z.boolean().describe("All required checks passed"),
    version: z.string(),
    platform: z.string(),
    checks: z.array(
      z.object({
        name: z.string(),
        ok: z.boolean(),
        required: z.boolean(),
        detail: z.string(),
        hint: z.string().nullable(),
        code: z.string().optional(),
      }),
    ),
  })
  .describe("Output of `doctor`");

const UpdateAction = z
  .object({
    action: z.enum(["installed", "updated", "current", "skipped", "failed"]),
  })
  .loose();

export const UpdateReport = z
  .object({
    self: UpdateAction.optional(),
    ytDlp: UpdateAction.optional(),
  })
  .describe("Output of `update` (with --check: version status objects instead of actions)");

export const ErrorOutput = z
  .object({
    error: z.object({
      code: z.enum([
        "INTERNAL",
        "USAGE",
        "NOT_FOUND",
        "RATE_LIMITED",
        "UNAVAILABLE",
        "MISSING_DEPENDENCY",
        "NETWORK",
      ]),
      message: z.string(),
      hint: z.string().nullable(),
      ref: z.string().optional().describe("The input that failed, when several were given"),
    }),
  })
  .describe("One line on stderr per failure; the process exits non-zero");
