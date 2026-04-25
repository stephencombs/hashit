import { z } from "zod";

const v2MessagePartSchema = z.object({ type: z.string() }).passthrough();
const v2ChatMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

const v2ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: v2ChatMessageRoleSchema,
  content: z.string().optional(),
  parts: z.array(v2MessagePartSchema).optional(),
});

export const v2ChatRequestSchema = z.object({
  messages: z.array(v2ChatMessageSchema),
  data: z
    .object({
      threadId: z.string().optional(),
      conversationId: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      systemPrompt: z.string().max(4000).optional(),
      maxToolIterations: z.number().int().min(1).max(20).optional(),
      selectedServers: z.array(z.string()).optional(),
      enabledTools: z.record(z.string(), z.array(z.string())).optional(),
      source: z.string().optional(),
    })
    .optional(),
});

export type V2IncomingChatRole = z.infer<typeof v2ChatMessageRoleSchema>;
export type V2IncomingChatMessage = z.infer<typeof v2ChatMessageSchema>;
export type V2ChatRequestData = NonNullable<
  z.infer<typeof v2ChatRequestSchema>["data"]
>;
