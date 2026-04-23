import assert from "node:assert/strict";
import {
  createRunMetadata,
  summarizeToolActivity,
} from "../../src/lib/agent-runtime-utils";
import { resolveAgentModel } from "../../src/lib/agent-profile-policy";
import type {
  AgentRunStatus,
  AgentRunTelemetry,
} from "../../src/lib/agent-runner";

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

function createTelemetry(status: AgentRunStatus): AgentRunTelemetry {
  const startedAt = Date.now();
  return {
    profile: "automation",
    source: "automation-executor",
    status,
    requestId: "req_eval",
    streamId: "stream_eval",
    conversationId: "thread_eval",
    provider: "openai",
    model: "gpt-5",
    traceId: "trace_eval",
    spanId: "span_eval",
    requestMessageCount: 1,
    iterationCount: 2,
    toolCallCount: 1,
    toolCalls: [
      {
        toolName: "HCM.Persons.Mcp__search_people",
        toolCallId: "tool_eval",
        ok: status === "completed",
        durationMs: 120,
        error: status === "completed" ? undefined : "tool failure",
      },
    ],
    mcpServersUsed: ["HCM.Persons.Mcp"],
    finishReason: status === "completed" ? "stop" : null,
    durationMs: 450,
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    error: status === "completed" ? undefined : "tool failure",
    startedAt,
    completedAt: startedAt + 450,
  };
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
    await runScenario("run-metadata-complete", async () => {
      const metadata = createRunMetadata(createTelemetry("completed"));
      assert.equal(metadata.runStatus, "completed");
      assert.equal(metadata.runSource, "automation-executor");
      assert.equal(metadata.traceId, "trace_eval");
      assert.equal(metadata.spanId, "span_eval");
      assert.equal(metadata.totalTokens, undefined);
      assert.deepEqual(metadata.usage, {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      assert.equal(metadata.partial, false);
    }),
  );

  results.push(
    await runScenario("run-metadata-error", async () => {
      const metadata = createRunMetadata(createTelemetry("failed"), {
        partial: true,
      });
      assert.equal(metadata.runStatus, "failed");
      assert.equal(metadata.partial, true);
      assert.equal(metadata.error, "tool failure");
      assert.equal(metadata.traceId, "trace_eval");
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
          ["completed", "failed", "aborted"].includes(result.telemetry.status),
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

  console.table(
    results.map((result) => ({
      id: result.id,
      status: result.status,
      detail: result.detail ?? "",
    })),
  );

  console.log(
    `agent-runtime evals: ${passed} passed, ${failed.length} failed, ` +
      `${results.filter((result) => result.status === "skipped").length} skipped`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("agent-runtime eval harness failed to start:", error);
  process.exitCode = 1;
});
