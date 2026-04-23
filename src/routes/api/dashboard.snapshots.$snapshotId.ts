import { createFileRoute } from "@tanstack/react-router";
import { createError } from "evlog";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { dashboardSnapshots } from "~/db/schema";
import {
  dashboardSnapshotDetailResponseSchema,
  dashboardSnapshotWireSchema,
} from "~/lib/dashboard-schemas";

export const Route = createFileRoute("/api/dashboard/snapshots/$snapshotId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const snapshotId = params.snapshotId;
        if (!snapshotId) {
          throw createError({
            message: "Missing snapshot id",
            status: 400,
            why: "Route matched without a snapshotId",
            fix: "Call /api/dashboard/snapshots/:id with a valid id",
          });
        }

        const row = await db
          .select()
          .from(dashboardSnapshots)
          .where(eq(dashboardSnapshots.id, snapshotId))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (!row) {
          return Response.json(
            { error: { message: "Snapshot not found" } },
            { status: 404 },
          );
        }

        const snapshot = dashboardSnapshotWireSchema.parse({
          id: row.id,
          status: row.status,
          persona: row.persona,
          recipes: row.recipes ?? null,
          widgets: row.widgets ?? null,
          error: row.error ?? null,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
        });

        return Response.json(
          dashboardSnapshotDetailResponseSchema.parse({ snapshot }),
        );
      },
    },
  },
});
