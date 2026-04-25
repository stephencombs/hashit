import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from "@durable-streams/tanstack-ai-transport";
import { generateMessageId } from "@tanstack/ai";
import {
  createAgentRun,
  type AgentRunState,
} from "~/shared/lib/server/agent-runner";
import { buildV2ChatStreamPath } from "~/features/chat-v2/server/keys";
import {
  appendV2CustomEvents,
  buildV2TerminalEvents,
} from "~/features/chat-v2/server/persistence-runtime";
import { projectV2StreamSnapshotToDb } from "~/features/chat-v2/server/stream-projection";
import { createV2ThreadServer } from "~/features/chat-v2/server/threads.server";
import { listV2ThreadMessagesServer } from "~/features/chat-v2/server/messages.server";
import { withJsonRender } from "~/shared/lib/json-render-stream";
import { getDurableChatSessionTarget } from "~/shared/lib/durable-streams";

type AutomationMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

function buildAutomationTitle(prompt: string): string {
  return prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
}

function toAgentRunMessages(
  messages: Awaited<ReturnType<typeof listV2ThreadMessagesServer>>,
): Array<AutomationMessage> {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [
      {
        id: message.id,
        role: message.role,
        content: message.renderText,
      },
    ];
  });
}

function buildUserMessage(prompt: string): DurableSessionMessage {
  return {
    id: generateMessageId(),
    role: "user",
    parts: [{ type: "text", content: prompt }],
  };
}

export async function executeAutomationRun(
  prompt: string,
  existingThreadId: string | undefined,
): Promise<{
  threadId: string;
  runState: AgentRunState;
}> {
  let threadId = existingThreadId;

  if (!threadId) {
    const thread = await createV2ThreadServer({
      title: buildAutomationTitle(prompt),
    });
    threadId = thread.id;
  }

  const persistedMessages = toAgentRunMessages(
    await listV2ThreadMessagesServer(threadId),
  );
  const lastMessage = persistedMessages[persistedMessages.length - 1];
  const shouldAppendUser =
    lastMessage?.role !== "user" || lastMessage.content !== prompt;
  const userMessage = shouldAppendUser ? buildUserMessage(prompt) : undefined;
  const messages =
    userMessage === undefined
      ? persistedMessages
      : [
          ...persistedMessages,
          {
            id: userMessage.id,
            role: "user" as const,
            content: prompt,
          },
        ];

  const { stream, runState } = await createAgentRun({
    profile: "automation",
    messages,
    conversationId: threadId,
  });

  const streamTarget = getDurableChatSessionTarget(
    buildV2ChatStreamPath(threadId),
  );
  const newMessages = userMessage ? [userMessage] : [];

  let persistenceError: string | undefined;
  await toDurableChatSessionResponse({
    stream: streamTarget,
    newMessages,
    responseStream: withJsonRender(stream),
    mode: "await",
  });

  try {
    await projectV2StreamSnapshotToDb({ threadId });
  } catch (error) {
    persistenceError = error instanceof Error ? error.message : String(error);
  }

  try {
    await appendV2CustomEvents(
      streamTarget,
      buildV2TerminalEvents({
        threadId,
        runState,
        persistenceError,
      }),
    );
  } catch {
    // The automation result is authoritative even if terminal stream metadata fails.
  }

  return {
    threadId,
    runState,
  };
}
