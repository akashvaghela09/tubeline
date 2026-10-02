import { z } from "zod";

export const Image = z.object({
  url: z.url(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type Image = z.infer<typeof Image>;
