import { defineTask } from "nitro/task";
import { generateDashboard } from "../../src/features/dashboard/server/dashboard-generator";
import type { PersistedWidget } from "../../src/features/dashboard/contracts/dashboard-schemas";

export default defineTask({
  meta: {
    name: "dashboard:generate",
    description: "Generate dashboard widgets in the background",
  },
  async run({ payload }) {
    const { snapshotId, persona, previousWidgetIds, previousWidgets } =
      payload as {
        snapshotId: string;
        persona: string;
        previousWidgetIds: string[];
        previousWidgets?: PersistedWidget[];
      };

    await generateDashboard({
      snapshotId,
      persona,
      previousWidgetIds,
      previousWidgets,
    });

    return { result: { snapshotId } };
  },
});
