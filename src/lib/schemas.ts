import { z } from "zod";
import { createSelectSchema, createInsertSchema } from "drizzle-orm/zod";
import { threads, messages, automations, automationRuns } from "~/db/schema";

const coercedDate = z.coerce.date();

export const selectThreadSchema = createSelectSchema(threads, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  deletedAt: coercedDate.nullable(),
  pinnedAt: coercedDate.nullable(),
}).extend({
  isStreaming: z.boolean().optional().default(false),
});
export const insertThreadSchema = createInsertSchema(threads);

export const selectMessageSchema = createSelectSchema(messages, {
  createdAt: coercedDate,
});
export const insertMessageSchema = createInsertSchema(messages);

export const threadWithMessagesSchema = selectThreadSchema.extend({
  messages: z.array(selectMessageSchema),
});

export const createThreadBodySchema = z.object({
  id: z.string().min(1).max(128).optional(),
  title: z.string().optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      // Preserved verbatim so durable-stream echoes reuse the client-side
      // message id; without it the transport mints a new UUID for the echo
      // and the client renders a duplicate user bubble alongside its
      // locally-added message.
      id: z.string().optional(),
      role: z.string(),
      parts: z.array(z.object({ type: z.string() }).passthrough()).optional(),
      content: z.string().optional(),
    }),
  ),
  data: z
    .object({
      threadId: z.string().optional(),
      conversationId: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      systemPrompt: z.string().optional(),
      selectedServers: z.array(z.string()).optional(),
      enabledTools: z.record(z.string(), z.array(z.string())).optional(),
      source: z.string().optional(),
    })
    .optional(),
});

export const selectAutomationSchema = createSelectSchema(automations, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  lastRunAt: coercedDate.nullable(),
  nextRunAt: coercedDate.nullable(),
  deletedAt: coercedDate.nullable(),
});

export const selectAutomationRunSchema = createSelectSchema(automationRuns, {
  startedAt: coercedDate,
  completedAt: coercedDate.nullable(),
});

export const createAutomationBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["chat-prompt", "webhook"]),
  cronExpression: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional().default(true),
});

export const updateAutomationBodySchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["chat-prompt", "webhook"]).optional(),
  cronExpression: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type Thread = z.infer<typeof selectThreadSchema>;
export type Message = z.infer<typeof selectMessageSchema>;
export type ThreadWithMessages = z.infer<typeof threadWithMessagesSchema>;
export type Automation = z.infer<typeof selectAutomationSchema>;
export type AutomationRun = z.infer<typeof selectAutomationRunSchema>;
