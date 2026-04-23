import { withJsonRender } from "~/lib/json-render-stream";
import { createAgentRun, type AgentRunTelemetry } from "~/lib/agent-runner";
import {
  createThread,
  loadThreadMessagesForRuntime,
  withPersistence,
} from "~/lib/chat-helpers";
import type { RequestLogger } from "evlog";
import type { MessagePart, StreamChunk } from "@tanstack/ai";
import type { AgentTraceState } from "~/lib/telemetry/agent-spans";

export interface PreparedAutomationRun {
  threadId: string;
  threadCreated: boolean;
  prompt: string;
  userParts: Array<MessagePart>;
  telemetry: AgentRunTelemetry;
  stream: AsyncIterable<StreamChunk>;
}

export async function prepareAutomationRun(
  prompt: string,
  existingThreadId: string | undefined,
  log?: RequestLogger,
  traceState?: AgentTraceState,
): Promise<PreparedAutomationRun> {
  let threadId = existingThreadId;
  let threadCreated = false;

  if (!threadId) {
    const title = prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt;
    threadId = await createThread(title, "automation");
    threadCreated = true;
  }

  const persistedMessages = await loadThreadMessagesForRuntime(threadId);
  const lastMessage = persistedMessages[persistedMessages.length - 1];
  const messages =
    lastMessage?.role === "user" && lastMessage.content === prompt
      ? persistedMessages
      : [...persistedMessages, { role: "user" as const, content: prompt }];

  const userParts: Array<MessagePart> = [{ type: "text", content: prompt }];

  const { stream, telemetry } = await createAgentRun({
    profile: "automation",
    source: traceState?.source ?? "automation-executor",
    messages,
    conversationId: threadId,
    log,
    traceState,
  });

  return {
    threadId,
    threadCreated,
    prompt,
    userParts,
    telemetry,
    stream: withJsonRender(stream),
  };
}

export async function executeAutomationRun(
  prompt: string,
  existingThreadId: string | undefined,
  log?: RequestLogger,
  traceState?: AgentTraceState,
): Promise<{
  threadId: string;
  telemetry: AgentRunTelemetry;
}> {
  const prepared = await prepareAutomationRun(
    prompt,
    existingThreadId,
    log,
    traceState,
  );

  for await (const _chunk of withPersistence(
    prepared.stream,
    prepared.threadId,
    prepared.threadCreated,
    prepared.prompt,
    prepared.userParts,
    true,
    log ?? ({ set() {} } as RequestLogger),
    prepared.telemetry,
  )) {
    // Drain the stream to completion so persistence and middleware can run.
  }

  return {
    threadId: prepared.threadId,
    telemetry: prepared.telemetry,
  };
}
