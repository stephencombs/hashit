import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type {
  PersistedRecipe,
  PersistedWidget,
} from "~/features/dashboard/contracts/dashboard-schemas";

export type DashboardSnapshotStatus = "generating" | "complete" | "failed";

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
