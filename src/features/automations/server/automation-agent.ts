import { withJsonRender } from "~/shared/lib/json-render-stream";
import {
  createAgentRun,
  type AgentRunState,
} from "~/features/chat-v1/server/agent-runner";
import {
  createThread,
  loadThreadMessagesForRuntime,
  withPersistence,
} from "~/features/chat-v1/server/chat-helpers";
import type { MessagePart, StreamChunk } from "@tanstack/ai";

export interface PreparedAutomationRun {
  threadId: string;
  threadCreated: boolean;
  prompt: string;
  userParts: Array<MessagePart>;
  runState: AgentRunState;
  stream: AsyncIterable<StreamChunk>;
}

export async function prepareAutomationRun(
  prompt: string,
  existingThreadId: string | undefined,
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

  const { stream, runState } = await createAgentRun({
    profile: "automation",
    messages,
    conversationId: threadId,
  });

  return {
    threadId,
    threadCreated,
    prompt,
    userParts,
    runState,
    stream: withJsonRender(stream),
  };
}

export async function executeAutomationRun(
  prompt: string,
  existingThreadId: string | undefined,
): Promise<{
  threadId: string;
  runState: AgentRunState;
}> {
  const prepared = await prepareAutomationRun(prompt, existingThreadId);

  for await (const _chunk of withPersistence(
    prepared.stream,
    prepared.threadId,
    prepared.threadCreated,
    prepared.prompt,
    prepared.userParts,
    true,
    prepared.runState,
  )) {
    // Drain the stream to completion so persistence and middleware can run.
  }

  return {
    threadId: prepared.threadId,
    runState: prepared.runState,
  };
}
