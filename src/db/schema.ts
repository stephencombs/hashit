import {
  pgTable,
  text,
  boolean,
  integer,
  serial,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { AppMessagePart } from "~/components/chat/message-row.types";
import type { PersistedRecipe, PersistedWidget } from "~/lib/dashboard-schemas";

export const threads = pgTable("threads", {
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

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  parts: jsonb("parts").$type<Array<AppMessagePart>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

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

export const v2ThreadRuns = pgTable("v2_thread_runs", {
  threadId: text("thread_id")
    .primaryKey()
    .references(() => v2Threads.id),
  runCount: integer("run_count").notNull().default(1),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const v2ThreadActivityEvents = pgTable(
  "v2_thread_activity_events",
  {
    id: serial("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => v2Threads.id),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (t) => [index("v2_thread_activity_events_id_idx").on(t.id)],
);

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

export type AutomationType = "chat-prompt" | "webhook";
export type AutomationRunStatus = "success" | "failure" | "running";

export const automations = pgTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").$type<AutomationType>().notNull(),
  cronExpression: text("cron_expression").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});

export const automationRuns = pgTable("automation_runs", {
  id: text("id").primaryKey(),
  automationId: text("automation_id")
    .notNull()
    .references(() => automations.id),
  startedAt: timestamp("started_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  status: text("status").$type<AutomationRunStatus>().notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type DashboardSnapshotStatus = "generating" | "complete" | "failed";

export type { PersistedRecipe, PersistedWidget } from "~/lib/dashboard-schemas";

export const dashboardSnapshots = pgTable(
  "dashboard_snapshots",
  {
    id: text("id").primaryKey(),
    persona: text("persona").notNull(),
    status: text("status")
      .$type<DashboardSnapshotStatus>()
      .notNull()
      .default("generating"),
    recipes: jsonb("recipes").$type<PersistedRecipe[]>(),
    widgets: jsonb("widgets").$type<PersistedWidget[]>(),
    previousWidgetIds: jsonb("previous_widget_ids").$type<string[]>(),
    error: text("error"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (t) => [
    index("dashboard_snapshots_persona_created_at_idx").on(
      t.persona,
      t.createdAt,
    ),
  ],
);
