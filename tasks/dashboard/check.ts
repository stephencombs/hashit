import { defineTask } from "nitro/task";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../src/db";
import { dashboardSnapshots } from "../../src/db/schema";
import { generateDashboard } from "../../server/lib/dashboard-generator";
import type { PersistedWidget } from "../../src/db/schema";

const STALE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERSONA = "HR Admin";

export default defineTask({
  meta: {
    name: "dashboard:check",
    description: "Check if dashboard needs regeneration",
  },
  async run() {
    const persona = DEFAULT_PERSONA;

    const latest = await db
      .select()
      .from(dashboardSnapshots)
      .where(eq(dashboardSnapshots.persona, persona))
      .orderBy(desc(dashboardSnapshots.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (latest?.status === "generating") {
      console.log(
        `[dashboard:check] Snapshot ${latest.id} is still generating, skipping`,
      );
      return { result: { skipped: true, reason: "already_generating" } };
    }

    const isStale =
      !latest ||
      latest.status === "failed" ||
      Date.now() - latest.createdAt.getTime() > STALE_MS;

    if (!isStale) {
      console.log(
        `[dashboard:check] Latest snapshot ${latest!.id} is fresh (${Math.round((Date.now() - latest!.createdAt.getTime()) / 60_000)}m old), skipping`,
      );
      return { result: { skipped: true, reason: "fresh" } };
    }

    let previousWidgetIds: string[] = [];
    let previousWidgets: PersistedWidget[] = [];
    if (latest?.status === "complete" && latest.widgets) {
      const allWidgets = latest.widgets as PersistedWidget[];
      previousWidgets = allWidgets.filter((w) => w.spec !== null);
      previousWidgetIds = previousWidgets.map((w) => w.widgetId);
    }

    const snapshotId = nanoid();
    await db.insert(dashboardSnapshots).values({
      id: snapshotId,
      persona,
      status: "generating",
      previousWidgetIds,
      createdAt: new Date(),
    });

    console.log(
      `[dashboard:check] Triggering generation for snapshot ${snapshotId} (previousWidgetIds: ${previousWidgetIds.length})`,
    );

    await generateDashboard({
      snapshotId,
      persona,
      previousWidgetIds,
      previousWidgets,
    });

    return { result: { snapshotId, triggered: true } };
  },
});
