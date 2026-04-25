import { createSelectSchema } from "drizzle-orm/zod";
import type { Spec } from "@json-render/core";
import type { UIMessage } from "@tanstack/ai-react";
import { z } from "zod";
import { v2Messages, v2Threads } from "~/db/schema";

const coercedDate = z.coerce.date();
const TOOL_CALL_STATES = [
  "awaiting-input",
  "input-streaming",
  "input-complete",
  "approval-requested",
  "approval-responded",
] as const;
const TOOL_RESULT_STATES = ["streaming", "complete", "error"] as const;

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

export const v2ThreadSessionSchema = z.object({
  thread: v2ThreadSchema,
  initialResumeOffset: z.string().optional(),
});

export type V2ThreadSession = z.infer<typeof v2ThreadSessionSchema>;

export const v2RuntimePartSchema = z.union([
  z.object({
    type: z.literal("text"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("thinking"),
    content: z.string(),
  }),
  z
    .object({
      type: z.literal("tool-call"),
      id: z.string(),
      name: z.string(),
      arguments: z.string(),
      state: z.enum(TOOL_CALL_STATES),
      approval: z
        .object({
          id: z.string(),
          needsApproval: z.boolean(),
          approved: z.boolean().optional(),
        })
        .optional(),
      input: z.unknown().optional(),
      output: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("tool-result"),
      toolCallId: z.string(),
      state: z.enum(TOOL_RESULT_STATES),
      content: z.string().default(""),
      error: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("ui-spec"),
      spec: z.custom<Spec>(
        (value) => value != null && typeof value === "object",
        "Expected a json-render Spec object",
      ),
      specIndex: z.number().int().nonnegative(),
    })
    .passthrough(),
]);

export type V2RuntimePart = z.infer<typeof v2RuntimePartSchema>;
export type V2RuntimeMessage = Omit<UIMessage, "parts"> & {
  parts: Array<V2RuntimePart>;
  renderText: string;
};

export type V2ThreadMessagesPage = {
  messages: Array<V2RuntimeMessage>;
  nextCursor?: string;
  hasMore: boolean;
};

export type V2ThreadMessageUiSpecs = {
  messageId: string;
  specs: Array<Extract<V2RuntimePart, { type: "ui-spec" }>>;
};
