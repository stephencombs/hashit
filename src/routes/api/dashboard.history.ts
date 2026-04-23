import { createFileRoute } from "@tanstack/react-router";
import { createError } from "evlog";
import { desc, eq } from "drizzle-orm";
import { db } from "~/db";
import { dashboardSnapshots } from "~/db/schema";
import {
  dashboardHistoryResponseSchema,
  persistedRecipeSchema,
  persistedWidgetSchema,
} from "~/lib/dashboard-schemas";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const Route = createFileRoute("/api/dashboard/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const persona = url.searchParams.get("persona") || "HR Admin";
        const rawLimit = Number.parseInt(
          url.searchParams.get("limit") ?? "",
          10,
        );
        const limit = Number.isFinite(rawLimit)
          ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
          : DEFAULT_LIMIT;

        const rows = await db
          .select({
            id: dashboardSnapshots.id,
            persona: dashboardSnapshots.persona,
            status: dashboardSnapshots.status,
            error: dashboardSnapshots.error,
            createdAt: dashboardSnapshots.createdAt,
            completedAt: dashboardSnapshots.completedAt,
            recipes: dashboardSnapshots.recipes,
            widgets: dashboardSnapshots.widgets,
          })
          .from(dashboardSnapshots)
          .where(eq(dashboardSnapshots.persona, persona))
          .orderBy(desc(dashboardSnapshots.createdAt))
          .limit(limit);

        const summaries = rows.map((row) => {
          const recipes = persistedRecipeSchema.array().safeParse(row.recipes);
          const widgets = persistedWidgetSchema.array().safeParse(row.widgets);
          const recipeCount = recipes.success ? recipes.data.length : 0;
          const completedCount = widgets.success
            ? widgets.data.filter((w) => w.spec !== null).length
            : 0;
          const skippedCount = widgets.success
            ? widgets.data.filter(
                (w) => w.spec === null && Boolean(w.skipReason),
              ).length
            : 0;

          return {
            id: row.id,
            persona: row.persona,
            status: row.status,
            error: row.error ?? null,
            createdAt: row.createdAt.toISOString(),
            completedAt: row.completedAt?.toISOString() ?? null,
            recipeCount,
            completedCount,
            skippedCount,
          };
        });

        const parsed = dashboardHistoryResponseSchema.safeParse({
          snapshots: summaries,
        });
        if (!parsed.success) {
          throw createError({
            message: "Invalid dashboard history payload",
            status: 500,
            why: parsed.error.issues.map((issue) => issue.message).join("; "),
            fix: "Investigate snapshot rows returning unexpected shape",
          });
        }
        return Response.json(parsed.data);
      },
    },
  },
});
