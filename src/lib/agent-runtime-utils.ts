import type { AgentRunStatus, AgentRunTelemetry } from "~/lib/agent-runner";

export function summarizeToolActivity(toolName: string): string {
  const actionName = toolName.includes("__")
    ? toolName.split("__").at(-1) || toolName
    : toolName;
  const normalized = actionName
    .replace(/__/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Using tools";
  const words = normalized.split(" ").slice(-4);
  const phrase = words.join(" ").toLowerCase();
  return `Using ${phrase}`;
}

export function createRunMetadata(
  telemetry: AgentRunTelemetry,
  overrides?: Partial<{
    status: AgentRunStatus;
    error: string;
    partial: boolean;
  }>,
): Record<string, unknown> {
  const status = overrides?.status ?? telemetry.status;
  return {
    runProfile: telemetry.profile,
    runSource: telemetry.source,
    runStatus: status,
    requestId: telemetry.requestId,
    streamId: telemetry.streamId,
    conversationId: telemetry.conversationId,
    provider: telemetry.provider,
    model: telemetry.model,
    traceId: telemetry.traceId,
    spanId: telemetry.spanId,
    iterationCount: telemetry.iterationCount,
    toolCallCount: telemetry.toolCallCount,
    toolCalls: telemetry.toolCalls,
    mcpServersUsed: telemetry.mcpServersUsed,
    finishReason: telemetry.finishReason,
    usage: telemetry.usage,
    durationMs: telemetry.durationMs,
    error: overrides?.error ?? telemetry.error,
    partial: overrides?.partial ?? false,
    startedAt: new Date(telemetry.startedAt).toISOString(),
    completedAt:
      telemetry.completedAt != null
        ? new Date(telemetry.completedAt).toISOString()
        : null,
  };
}
