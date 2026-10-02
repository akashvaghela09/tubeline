// Registry behind `yt-data schema`: which model each command prints.
import { z } from "zod";
import { Channel } from "./channel.ts";
import {
  CaptionTrackList,
  DoctorReport,
  DownloadResult,
  ErrorOutput,
  ThumbnailResult,
  TranscriptFile,
  UpdateReport,
} from "./results.ts";
import { Transcript, Video, VideoSummary } from "./video.ts";

export interface SchemaEntry {
  name: string;
  summary: string;
  schema: z.ZodType;
}

/** One entry per output shape. Multi-ref commands print an array of these (or NDJSON lines). */
export const SCHEMAS: SchemaEntry[] = [
  { name: "channel", summary: "`channel` — one per ref", schema: Channel },
  { name: "video", summary: "`video` and `videos --full` — one per video", schema: Video },
  { name: "videos", summary: "`videos` — one per listed video", schema: VideoSummary },
  { name: "transcript", summary: "`transcript --as json`", schema: Transcript },
  { name: "transcript-list", summary: "`transcript --list`", schema: CaptionTrackList },
  { name: "transcript-file", summary: "`transcript -o …`", schema: TranscriptFile },
  { name: "thumbnail", summary: "`thumbnail` — one per ref", schema: ThumbnailResult },
  { name: "download", summary: "`download` — one per file", schema: DownloadResult },
  { name: "doctor", summary: "`doctor`", schema: DoctorReport },
  { name: "update", summary: "`update`", schema: UpdateReport },
  { name: "error", summary: "stderr error line (all commands)", schema: ErrorOutput },
];

export function jsonSchema(entry: SchemaEntry): Record<string, unknown> {
  const schema = z.toJSONSchema(entry.schema, { target: "draft-2020-12", unrepresentable: "any" });
  return { title: entry.name, ...(stripSafeIntBounds(schema) as object) };
}

/** zod emits ±(2^53-1) bounds on every .int(); they're noise for readers of the schema. */
function stripSafeIntBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSafeIntBounds);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === "minimum" || k === "maximum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER)
      continue;
    out[k] = stripSafeIntBounds(v);
  }
  return out;
}
