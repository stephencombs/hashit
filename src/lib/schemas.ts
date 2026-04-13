import { z } from 'zod'
import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod'
import { threads, messages } from '~/db/schema'

const coercedDate = z.coerce.date()

export const selectThreadSchema = createSelectSchema(threads, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  deletedAt: coercedDate.nullable(),
  pinnedAt: coercedDate.nullable(),
})
export const insertThreadSchema = createInsertSchema(threads)

export const selectMessageSchema = createSelectSchema(messages, {
  createdAt: coercedDate,
})
export const insertMessageSchema = createInsertSchema(messages)

export const threadWithMessagesSchema = selectThreadSchema.extend({
  messages: z.array(selectMessageSchema),
})

export const createThreadBodySchema = z.object({
  title: z.string().optional(),
})

export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.string(),
      parts: z
        .array(z.object({ type: z.string() }).passthrough())
        .optional(),
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
    })
    .optional(),
})

export type Thread = z.infer<typeof selectThreadSchema>
export type Message = z.infer<typeof selectMessageSchema>
export type ThreadWithMessages = z.infer<typeof threadWithMessagesSchema>
