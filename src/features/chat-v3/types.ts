import { createSelectSchema } from "drizzle-orm/zod";
import type { UIMessage } from "ai";
import { z } from "zod";
import { v3Threads } from "~/db/schema";

const coercedDate = z.coerce.date();

export const v3ThreadSchema = createSelectSchema(v3Threads, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  deletedAt: coercedDate.nullable(),
  pinnedAt: coercedDate.nullable(),
  messages: z.array(
    z.custom<UIMessage>(
      (value) => value != null && typeof value === "object",
      "Expected an AI SDK UIMessage object",
    ),
  ),
});

export const v3ThreadSummarySchema = v3ThreadSchema.omit({ messages: true });

export type V3Thread = z.infer<typeof v3ThreadSchema>;
export type V3ThreadSummary = z.infer<typeof v3ThreadSummarySchema>;
