import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from "@durable-streams/tanstack-ai-transport";
import { getDurableChatSessionTarget } from "~/shared/lib/durable-streams";
import { createHttpError } from "~/shared/lib/http-error";
import type {
  V2ChatRequestData,
  V2IncomingChatMessage,
} from "../../contracts/chat-contract";
import {
  createV2AgentRun,
  type V2AgentRunMessages,
} from "../runtime/agent-runner";
import { resolveV2RuntimePolicy } from "../runtime/policy";
import { resolveV2Tools } from "../runtime/tools";
import { withV2JsonRenderEvents } from "../streams/json-render";
import { buildV2ChatStreamPath } from "../streams/paths";
import { appendV2CustomEvents, buildV2TerminalEvents } from "../streams/events";
import { hasV2MessageByIdServer } from "../repositories/messages";
import { projectV2StreamSnapshotToDb } from "../projection/projector";
import { extractTextContent, extractV2UserMessage } from "./user-message";
import { queueV2ThreadTitleGeneration } from "./thread-title";

type MinimalMessage = {
  role?: string;
  id?: string;
  content?: string;
  parts?: Array<unknown>;
};

export type SubmitV2ChatTurnInput = {
  threadId: string;
  messages: Array<V2IncomingChatMessage>;
  data?: V2ChatRequestData;
};

type SubmitV2ChatTurnDependencies = {
  createAgentRun: typeof createV2AgentRun;
  resolvePolicy: typeof resolveV2RuntimePolicy;
  resolveTools: typeof resolveV2Tools;
  projectSnapshot: typeof projectV2StreamSnapshotToDb;
  appendCustomEvents: typeof appendV2CustomEvents;
  buildTerminalEvents: typeof buildV2TerminalEvents;
  queueTitleGeneration: typeof queueV2ThreadTitleGeneration;
  hasMessageById: typeof hasV2MessageByIdServer;
  toDurableResponse: typeof toDurableChatSessionResponse;
};

const defaultDependencies: SubmitV2ChatTurnDependencies = {
  createAgentRun: createV2AgentRun,
  resolvePolicy: resolveV2RuntimePolicy,
  resolveTools: resolveV2Tools,
  projectSnapshot: projectV2StreamSnapshotToDb,
  appendCustomEvents: appendV2CustomEvents,
  buildTerminalEvents: buildV2TerminalEvents,
  queueTitleGeneration: queueV2ThreadTitleGeneration,
  hasMessageById: hasV2MessageByIdServer,
  toDurableResponse: toDurableChatSessionResponse,
};

function extractLatestUserMessage(
  messages: Array<MinimalMessage>,
): DurableSessionMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message as DurableSessionMessage;
    }
  }
  return undefined;
}

function hasUsablePayload(message: MinimalMessage): boolean {
  const hasContent =
    typeof message.content === "string" && message.content.trim().length > 0;
  const hasTextParts =
    Array.isArray(message.parts) &&
    extractTextContent(message.parts).trim().length > 0;
  return hasContent || hasTextParts;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertV2ChatEnvironment(): void {
  if (
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_DEPLOYMENT
  ) {
    return;
  }

  throw createHttpError({
    message: "Azure OpenAI environment variables not configured",
    status: 500,
    why: "Missing one or more required environment variables",
    fix: "Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT",
  });
}

export async function submitV2ChatTurn(
  input: SubmitV2ChatTurnInput,
  dependencies: SubmitV2ChatTurnDependencies = defaultDependencies,
): Promise<Response> {
  assertV2ChatEnvironment();

  const { threadId, messages, data } = input;
  if (!messages.some((message) => hasUsablePayload(message))) {
    throw createHttpError({
      message: "V2 request has no usable message content",
      status: 400,
      why: "All input messages are empty.",
      fix: "Send at least one message with text content.",
    });
  }

  const {
    id: userMessageId,
    content: userContent,
    parts: userParts,
  } = extractV2UserMessage(messages);

  const latestMessage = messages[messages.length - 1];
  const hasNewUserTurn = latestMessage?.role === "user";
  const hasUserTurn = userContent.length > 0 || userParts.length > 0;
  const hasPersistedLatestUserMessage =
    hasNewUserTurn && typeof userMessageId === "string"
      ? await dependencies.hasMessageById({
          threadId,
          messageId: userMessageId,
        })
      : false;
  const isRegenerationTurn = hasNewUserTurn && hasPersistedLatestUserMessage;
  const shouldPersistUserTurn =
    hasNewUserTurn && hasUserTurn && !isRegenerationTurn;

  const streamPath = buildV2ChatStreamPath(threadId);
  const streamTarget = getDurableChatSessionTarget(streamPath);
  const conversationId = data?.conversationId ?? threadId;

  const runtimePolicy = dependencies.resolvePolicy({ data });
  const toolRuntime = await dependencies.resolveTools({
    policy: runtimePolicy,
  });

  const { stream: responseStream, runState } =
    await dependencies.createAgentRun({
      messages: messages as V2AgentRunMessages,
      conversationId,
      model: runtimePolicy.model,
      runtimePolicy,
      tools: toolRuntime.tools,
      allowedToolNames: toolRuntime.allowedToolNames,
    });
  const renderedResponseStream = withV2JsonRenderEvents(responseStream);

  const newUserMessage = shouldPersistUserTurn
    ? extractLatestUserMessage(messages)
    : undefined;
  const newMessages: Array<DurableSessionMessage> = newUserMessage
    ? [newUserMessage]
    : [];

  let persistenceError: string | undefined;
  const response = await dependencies.toDurableResponse({
    stream: streamTarget,
    newMessages,
    responseStream: renderedResponseStream,
    mode: "await",
  });

  try {
    await dependencies.projectSnapshot({
      threadId,
      replaceLatestAssistant: isRegenerationTurn,
    });
  } catch (error) {
    persistenceError = toErrorMessage(error);
  }

  const terminalEvents = dependencies.buildTerminalEvents({
    threadId,
    runState,
    persistenceError,
  });

  try {
    await dependencies.appendCustomEvents(streamTarget, terminalEvents);
  } catch {
    // Best effort: durable response already succeeded.
  }

  if (shouldPersistUserTurn && !persistenceError) {
    dependencies.queueTitleGeneration({
      threadId,
      streamTarget,
    });
  }

  return response;
}
