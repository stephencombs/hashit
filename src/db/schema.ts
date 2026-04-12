import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { MessagePart } from '@tanstack/ai'

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  parts: text('parts', { mode: 'json' }).$type<Array<MessagePart>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
