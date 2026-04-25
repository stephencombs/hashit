import { DurableStream } from "@durable-streams/client";
import {
  appendSanitizedChunksToStream,
  type DurableChatSessionStreamTarget,
} from "@durable-streams/tanstack-ai-transport";
import type { StreamChunk } from "@tanstack/ai";
import {
  V2_DURABLE_CUSTOM_EVENT_NAMES,
  type V2RunTerminalEventName,
} from "../domain";

type V2TerminalRunState = {
  status: "running" | "awaiting_input" | "completed" | "failed" | "aborted";
  error?: string;
};

type BuildV2TerminalEventsOptions = {
  threadId: string;
  runState: V2TerminalRunState;
  persistenceError?: string;
};

export function getRunTerminalEventName(
  status: V2TerminalRunState["status"],
): V2RunTerminalEventName {
  if (status === "completed") return V2_DURABLE_CUSTOM_EVENT_NAMES.runComplete;
  if (status === "aborted") return V2_DURABLE_CUSTOM_EVENT_NAMES.runAborted;
  if (status === "awaiting_input") {
    return V2_DURABLE_CUSTOM_EVENT_NAMES.runWaitingInput;
  }
  return V2_DURABLE_CUSTOM_EVENT_NAMES.runError;
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
  return [
    createV2CustomChunk(getRunTerminalEventName(runState.status), {
      threadId,
      status: runState.status,
      error: runState.error ?? null,
    }),
    createV2CustomChunk(V2_DURABLE_CUSTOM_EVENT_NAMES.persistenceComplete, {
      threadId,
      status: runState.status,
      error: persistenceError ?? runState.error ?? null,
    }),
  ];
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
