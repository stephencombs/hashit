import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { v2Messages, v2Threads } from "~/db/schema";

const coercedDate = z.coerce.date();

export const v2ThreadSchema = createSelectSchema(v2Threads, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  deletedAt: coercedDate.nullable(),
  pinnedAt: coercedDate.nullable(),
});
export type V2Thread = z.infer<typeof v2ThreadSchema>;

export const v2MessageSchema = createSelectSchema(v2Messages, {
  createdAt: coercedDate,
});
export type V2Message = z.infer<typeof v2MessageSchema>;

const v2ThreadSessionSchema = z.object({
  thread: v2ThreadSchema,
  initialResumeOffset: z.string().optional(),
});

export type V2ThreadSession = z.infer<typeof v2ThreadSessionSchema>;
