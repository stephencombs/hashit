import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { threads } from "./chat-v1";

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  spec: jsonb("spec").$type<Record<string, unknown>>(),
  threadId: text("thread_id").references(() => threads.id),
  messageId: text("message_id"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
