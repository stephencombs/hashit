import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";

export const v3Threads = pgTable(
  "v3_threads",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    messages: jsonb("messages")
      .$type<Array<UIMessage>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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
  },
  (t) => [
    index("v3_threads_active_updated_at_idx")
      .on(t.updatedAt, t.createdAt, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
