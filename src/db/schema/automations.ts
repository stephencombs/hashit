import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
