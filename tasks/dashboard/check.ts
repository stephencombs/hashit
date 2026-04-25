import { defineTask } from "nitro/task";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../src/db";
import { dashboardSnapshots } from "../../src/db/schema";
import { generateDashboard } from "../../src/features/dashboard/server/dashboard-generator";
import type { PersistedWidget } from "../../src/features/dashboard/contracts/dashboard-schemas";

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
      return { result: { skipped: true, reason: "already_generating" } };
    }

    const isStale =
      !latest ||
      latest.status === "failed" ||
      Date.now() - latest.createdAt.getTime() > STALE_MS;

    if (!isStale) {
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

    await generateDashboard({
      snapshotId,
      persona,
      previousWidgetIds,
      previousWidgets,
    });

    return { result: { snapshotId, triggered: true } };
  },
});
