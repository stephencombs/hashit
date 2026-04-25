import { defineTask } from "nitro/task";
import { generateDashboard } from "../../server/lib/dashboard-generator";

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
        previousWidgets?: import("../../src/db/schema").PersistedWidget[];
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
