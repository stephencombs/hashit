import { DurableStream } from "@durable-streams/client";
import {
  appendSanitizedChunksToStream,
  type DurableChatSessionStreamTarget,
} from "@durable-streams/tanstack-ai-transport";
import type { ChatMiddleware, StreamChunk } from "@tanstack/ai";
import type { RequestLogger } from "evlog";
import {
  finalizeAgentRunTrace,
  finishPersistenceSpan,
  startPersistenceSpan,
} from "~/lib/telemetry/agent-spans";
import type { V2AgentRunStatus, V2AgentRunTelemetry } from "./agent-runner";

/**
 * V2 persistence runtime helpers for the stream-first architecture.
 * Durable Stream writes are projected to Postgres outside middleware;
 * this module keeps telemetry finalization and custom-event append utilities.
 */
type CreateV2PersistenceMiddlewareOptions = {
  threadId: string;
  telemetry: V2AgentRunTelemetry;
  log?: RequestLogger;
};

type V2RunMetadataOverrides = Partial<{
  status: V2AgentRunStatus;
  error: string;
  partial: boolean;
}>;

type FinalizeV2PersistenceTelemetryOptions = {
  threadId: string;
  telemetry: V2AgentRunTelemetry;
  persistenceError?: string;
  eventError?: string;
};

type BuildV2TerminalEventsOptions = {
  threadId: string;
  telemetry: V2AgentRunTelemetry;
  persistenceError?: string;
};

export function createV2RunMetadata(
  telemetry: V2AgentRunTelemetry,
  overrides?: V2RunMetadataOverrides,
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

export function getRunTerminalEventName(
  status: V2AgentRunStatus,
): "run_complete" | "run_aborted" | "run_waiting_input" | "run_error" {
  if (status === "completed") return "run_complete";
  if (status === "aborted") return "run_aborted";
  if (status === "awaiting_input") return "run_waiting_input";
  return "run_error";
}

export function createV2CustomChunk(name: string, value: unknown): StreamChunk {
  return {
    type: "CUSTOM" as const,
    name,
    value,
    timestamp: Date.now(),
  };
}

export function finalizeV2PersistenceTelemetry({
  threadId,
  telemetry,
  persistenceError,
  eventError,
}: FinalizeV2PersistenceTelemetryOptions): void {
  const finalError =
    persistenceError ??
    eventError ??
    (telemetry.status === "failed" || telemetry.status === "aborted"
      ? telemetry.error
      : undefined);

  if (telemetry.traceState?.completed) {
    return;
  }

  finishPersistenceSpan(telemetry.traceState, {
    error: finalError ?? undefined,
    attributes: {
      "agent.status": telemetry.status,
      "agent.thread_id": threadId,
    },
  });
  finalizeAgentRunTrace(telemetry.traceState, {
    error: finalError ?? undefined,
    attributes: {
      "agent.status": telemetry.status,
      "agent.thread_id": threadId,
      "agent.tool_call_count": telemetry.toolCallCount,
      "agent.iteration_count": telemetry.iterationCount,
    },
  });
}

export function buildV2TerminalEvents({
  threadId,
  telemetry,
  persistenceError,
}: BuildV2TerminalEventsOptions): Array<StreamChunk> {
  const events: Array<StreamChunk> = [];
  events.push(
    createV2CustomChunk(getRunTerminalEventName(telemetry.status), {
      threadId,
      status: telemetry.status,
      finishReason: telemetry.finishReason ?? null,
      durationMs: telemetry.durationMs ?? null,
      toolCallCount: telemetry.toolCallCount,
      iterationCount: telemetry.iterationCount,
      error: telemetry.error ?? null,
      traceId: telemetry.traceId ?? null,
    }),
  );

  events.push(
    createV2CustomChunk("persistence_complete", {
      threadId,
      status: telemetry.status,
      error: persistenceError ?? telemetry.error ?? null,
      traceId: telemetry.traceId ?? null,
    }),
  );

  return events;
}

export async function appendV2CustomEvents(
  target: DurableChatSessionStreamTarget,
  events: Array<StreamChunk>,
): Promise<void> {
  if (events.length === 0) return;

  const stream = new DurableStream({
    url: target.writeUrl,
    headers: target.headers,
    batching: false,
    contentType: "application/json",
  });
  await appendSanitizedChunksToStream(stream, events);
}

export function createV2PersistenceMiddleware({
  threadId,
  telemetry,
  log,
}: CreateV2PersistenceMiddlewareOptions): ChatMiddleware {
  return {
    name: "v2-persistence",
    onStart() {
      startPersistenceSpan(telemetry.traceState, {
        "agent.thread_id": threadId,
      });
      log?.set({
        v2PersistenceSpanStarted: true,
      });
    },
  };
}
