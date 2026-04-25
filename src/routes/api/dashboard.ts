import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { desc, eq, and } from "drizzle-orm";
import { db } from "~/db";
import { dashboardSnapshots } from "~/db/schema";
import type { PersistedWidget } from "~/features/dashboard/contracts/dashboard-schemas";
import {
  persistedWidgetSchema,
  postDashboardBodySchema,
  postDashboardGenerationResultSchema,
  snapshotResponseSchema,
} from "~/features/dashboard/contracts/dashboard-schemas";
import { errorResponse } from "~/shared/lib/http-error";

const STALE_MS = 24 * 60 * 60 * 1000;
const GENERATING_TIMEOUT_MS = 10 * 60 * 1000;

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const persona = url.searchParams.get("persona") || "HR Admin";

        const latest = await db
          .select()
          .from(dashboardSnapshots)
          .where(eq(dashboardSnapshots.persona, persona))
          .orderBy(desc(dashboardSnapshots.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (
          latest?.status === "generating" &&
          Date.now() - latest.createdAt.getTime() > GENERATING_TIMEOUT_MS
        ) {
          await db
            .update(dashboardSnapshots)
            .set({
              status: "failed",
              error: "Generation timed out",
              completedAt: new Date(),
            })
            .where(eq(dashboardSnapshots.id, latest.id));
          latest.status = "failed";
          latest.error = "Generation timed out";
        }

        const isStale =
          !latest ||
          latest.status === "failed" ||
          Date.now() - latest.createdAt.getTime() > STALE_MS;

        const payload = {
          snapshot: latest
            ? {
                id: latest.id,
                status: latest.status,
                persona: latest.persona,
                recipes: latest.recipes ?? null,
                widgets: latest.widgets ?? null,
                error: latest.error ?? null,
                createdAt: latest.createdAt.toISOString(),
                completedAt: latest.completedAt?.toISOString() ?? null,
              }
            : null,
          isStale,
        };
        return Response.json(snapshotResponseSchema.parse(payload));
      },

      POST: async ({ request }) => {
        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          return errorResponse({
            message: "Azure OpenAI environment variables not configured",
            status: 500,
            why: "Missing one or more required environment variables",
            fix: "Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT",
          });
        }

        const url = new URL(request.url);
        const force = url.searchParams.get("force") === "true";
        const rawBody = await request.json().catch(() => ({}));
        const parsedBody = postDashboardBodySchema.safeParse(rawBody);
        if (!parsedBody.success) {
          return errorResponse({
            message: "Invalid dashboard generation request body",
            status: 400,
            why: parsedBody.error.issues
              .map((issue) => issue.message)
              .join("; "),
            fix: "Provide a JSON body matching { persona?: string }",
          });
        }
        const body = parsedBody.data;
        const persona = body.persona || "HR Admin";

        const existing = await db
          .select()
          .from(dashboardSnapshots)
          .where(
            and(
              eq(dashboardSnapshots.persona, persona),
              eq(dashboardSnapshots.status, "generating"),
            ),
          )
          .orderBy(desc(dashboardSnapshots.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (existing && !force) {
          const isStuck =
            Date.now() - existing.createdAt.getTime() > GENERATING_TIMEOUT_MS;
          if (!isStuck) {
            return Response.json(
              postDashboardGenerationResultSchema.parse({
                snapshotId: existing.id,
                status: "already_generating",
              }),
            );
          }
          await db
            .update(dashboardSnapshots)
            .set({
              status: "failed",
              error: "Generation timed out",
              completedAt: new Date(),
            })
            .where(eq(dashboardSnapshots.id, existing.id));
        }

        let previousWidgetIds: string[] = [];
        let previousWidgets: PersistedWidget[] = [];
        const lastComplete = await db
          .select()
          .from(dashboardSnapshots)
          .where(
            and(
              eq(dashboardSnapshots.persona, persona),
              eq(dashboardSnapshots.status, "complete"),
            ),
          )
          .orderBy(desc(dashboardSnapshots.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (lastComplete?.widgets) {
          const parsedWidgets = persistedWidgetSchema
            .array()
            .safeParse(lastComplete.widgets);
          if (parsedWidgets.success) {
            previousWidgets = parsedWidgets.data.filter((w) => w.spec !== null);
            previousWidgetIds = previousWidgets.map((w) => w.widgetId);
          }
        }

        const snapshotId = nanoid();
        const now = new Date();

        await db.insert(dashboardSnapshots).values({
          id: snapshotId,
          persona,
          status: "generating",
          previousWidgetIds,
          createdAt: now,
        });

        const { generateDashboard } =
          await import("../../../src/features/dashboard/server/dashboard-generator");
        generateDashboard({
          snapshotId,
          persona,
          previousWidgetIds,
          previousWidgets,
        }).catch(() => {});

        return Response.json(
          postDashboardGenerationResultSchema.parse({
            snapshotId,
            status: "started",
          }),
        );
      },
    },
  },
});
