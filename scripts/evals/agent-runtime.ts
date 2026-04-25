import assert from "node:assert/strict";
import { summarizeToolActivity } from "../../src/lib/agent-runtime-utils";
import { resolveAgentModel } from "../../src/lib/agent-profile-policy";

type ScenarioResult =
  | { id: string; status: "passed"; detail?: string }
  | { id: string; status: "skipped"; detail: string }
  | { id: string; status: "failed"; detail: string };

async function runScenario(
  id: string,
  fn: () => Promise<void>,
  options?: { enabled?: boolean; skipReason?: string },
): Promise<ScenarioResult> {
  if (options?.enabled === false) {
    return {
      id,
      status: "skipped",
      detail: options.skipReason ?? "Scenario disabled",
    };
  }

  try {
    await fn();
    return { id, status: "passed" };
  } catch (error) {
    return {
      id,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const integrationEnabled = process.env.AGENT_RUNTIME_EVAL_INTEGRATION === "1";
  const dashboardEnabled = process.env.AGENT_RUNTIME_EVAL_DASHBOARD === "1";
  const automationPrompt = process.env.AGENT_RUNTIME_EVAL_PROMPT;
  const dashboardPersona = process.env.AGENT_RUNTIME_EVAL_PERSONA;

  const results: ScenarioResult[] = [];

  results.push(
    await runScenario("profile-model-policy", async () => {
      assert.equal(resolveAgentModel("automation", "gpt-5"), undefined);
      assert.equal(resolveAgentModel("dashboardPlanning", "gpt-5"), undefined);
      assert.equal(resolveAgentModel("interactiveChat", "gpt-5"), "gpt-5");
    }),
  );

  results.push(
    await runScenario("deterministic-tool-summary", async () => {
      assert.equal(
        summarizeToolActivity("HCM.Persons.Mcp__search_people"),
        "Using search people",
      );
      assert.equal(
        summarizeToolActivity("HR.Onboarding.Mcp__get_new_hires"),
        "Using get new hires",
      );
    }),
  );

  results.push(
    await runScenario(
      "automation-live-run",
      async () => {
        const [{ executeAutomationRun }, { loadThreadMessagesForRuntime }] =
          await Promise.all([
            import("../../src/lib/automation-agent"),
            import("../../src/lib/chat-helpers"),
          ]);
        const result = await executeAutomationRun(automationPrompt!, undefined);
        assert.ok(result.threadId);
        assert.ok(
          ["completed", "failed", "aborted"].includes(result.runState.status),
        );
        const persisted = await loadThreadMessagesForRuntime(result.threadId);
        assert.ok(persisted.length >= 1);
      },
      {
        enabled: integrationEnabled && !!automationPrompt,
        skipReason:
          "Set AGENT_RUNTIME_EVAL_INTEGRATION=1 and AGENT_RUNTIME_EVAL_PROMPT to run a live automation scenario.",
      },
    ),
  );

  results.push(
    await runScenario(
      "dashboard-live-run",
      async () => {
        const [
          { nanoid },
          { eq },
          { db },
          { dashboardSnapshots },
          { generateDashboard },
        ] = await Promise.all([
          import("nanoid"),
          import("drizzle-orm"),
          import("../../src/db"),
          import("../../src/db/schema"),
          import("../../server/lib/dashboard-generator"),
        ]);
        const snapshotId = nanoid();
        await db.insert(dashboardSnapshots).values({
          id: snapshotId,
          persona: dashboardPersona!,
          status: "generating",
          previousWidgetIds: [],
          createdAt: new Date(),
        });

        await generateDashboard({
          snapshotId,
          persona: dashboardPersona!,
          previousWidgetIds: [],
          previousWidgets: [],
        });

        const [snapshot] = await db
          .select()
          .from(dashboardSnapshots)
          .where(eq(dashboardSnapshots.id, snapshotId))
          .limit(1);

        assert.ok(snapshot);
        assert.ok(["complete", "failed"].includes(snapshot.status));
        assert.ok(snapshot.completedAt);
      },
      {
        enabled: integrationEnabled && dashboardEnabled && !!dashboardPersona,
        skipReason:
          "Set AGENT_RUNTIME_EVAL_INTEGRATION=1, AGENT_RUNTIME_EVAL_DASHBOARD=1, and AGENT_RUNTIME_EVAL_PERSONA to run a live dashboard scenario.",
      },
    ),
  );

  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed");

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(
    `agent-runtime evals: ${passed} passed, ${failed.length} failed, ` +
      `${results.filter((result) => result.status === "skipped").length} skipped\n`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `agent-runtime eval harness failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
