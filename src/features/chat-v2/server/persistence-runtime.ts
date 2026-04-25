import { DurableStream } from "@durable-streams/client";
import {
  appendSanitizedChunksToStream,
  type DurableChatSessionStreamTarget,
} from "@durable-streams/tanstack-ai-transport";
import type { StreamChunk } from "@tanstack/ai";
import type { V2AgentRunState, V2AgentRunStatus } from "./agent-runner";

/**
 * V2 persistence runtime helpers for the stream-first architecture.
 * Durable Stream writes are projected to Postgres outside middleware.
 */
type BuildV2TerminalEventsOptions = {
  threadId: string;
  runState: V2AgentRunState;
  persistenceError?: string;
};

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

export function buildV2TerminalEvents({
  threadId,
  runState,
  persistenceError,
}: BuildV2TerminalEventsOptions): Array<StreamChunk> {
  const events: Array<StreamChunk> = [];
  events.push(
    createV2CustomChunk(getRunTerminalEventName(runState.status), {
      threadId,
      status: runState.status,
      error: runState.error ?? null,
    }),
  );

  events.push(
    createV2CustomChunk("persistence_complete", {
      threadId,
      status: runState.status,
      error: persistenceError ?? runState.error ?? null,
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
