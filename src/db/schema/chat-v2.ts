import {
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AppMessagePart } from "~/shared/types/message-parts";

export const v2Threads = pgTable("v2_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source"),
  resumeOffset: text("resume_offset"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  pinnedAt: timestamp("pinned_at", { withTimezone: true, mode: "date" }),
});

export const v2Messages = pgTable("v2_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => v2Threads.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  parts: jsonb("parts").$type<Array<AppMessagePart>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
