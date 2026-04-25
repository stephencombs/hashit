import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v2Threads } from "./chat-v2";

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  spec: jsonb("spec").$type<Record<string, unknown>>(),
  threadId: text("thread_id").references(() => v2Threads.id),
  messageId: text("message_id"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
