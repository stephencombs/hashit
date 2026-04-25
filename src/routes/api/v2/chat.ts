import { createFileRoute } from "@tanstack/react-router";
import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from "@durable-streams/tanstack-ai-transport";
import { getDurableChatSessionTarget } from "~/lib/durable-streams";
import {
  isVisionCapableModel,
  userMessagesContainMedia,
} from "~/lib/multimodal-parts";
import {
  createV2AgentRun,
  type V2AgentRunMessages,
} from "~/features/chat-v2/server/agent-runner";
import { v2ChatRequestSchema } from "~/features/chat-v2/server/chat-contract";
import { buildV2ChatStreamPath } from "~/features/chat-v2/server/keys";
import {
  appendV2CustomEvents,
  buildV2TerminalEvents,
} from "~/features/chat-v2/server/persistence-runtime";
import { hasV2MessageByIdServer } from "~/features/chat-v2/server/messages.server";
import {
  createV2RunLifecycleController,
  createV2RunLifecycleMiddleware,
} from "~/features/chat-v2/server/run-lifecycle-middleware";
import { withV2JsonRenderEvents } from "~/features/chat-v2/server/json-render-events";
import { projectV2StreamSnapshotToDb } from "~/features/chat-v2/server/stream-projection";
import { beginV2ThreadRun } from "~/features/chat-v2/server/thread-run-state.server";
import { queueV2ThreadTitleGeneration } from "~/features/chat-v2/server/thread-title";
import { extractV2UserMessage } from "~/features/chat-v2/server/user-message";
import { resolveV2RuntimePolicy } from "~/features/chat-v2/server/runtime-policy";
import { resolveV2Tools } from "~/features/chat-v2/server/tool-runtime";
import { errorResponse } from "~/lib/http-error";

type MinimalMessage = {
  role?: string;
  id?: string;
  content?: string;
  parts?: Array<unknown>;
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
  const hasParts = Array.isArray(message.parts) && message.parts.length > 0;
  return hasContent || hasParts;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const Route = createFileRoute("/api/v2/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          return errorResponse({
            message: "Azure OpenAI environment variables not configured",
            status: 500,
            why: "Missing one or more required environment variables",
            fix: "Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT",
          });
        }

        const body = await request.json().catch(() => undefined);
        const parsedBody = v2ChatRequestSchema.safeParse(body);
        if (!parsedBody.success) {
          return errorResponse({
            message: "Invalid V2 chat request payload",
            status: 400,
            why:
              parsedBody.error.issues[0]?.message ??
              "Request body does not match schema",
            fix: "Send a payload with `messages` and optional `data` fields matching the V2 chat contract.",
          });
        }

        const { messages, data } = parsedBody.data;
        const url = new URL(request.url);
        const threadId = url.searchParams.get("id") ?? data?.threadId;
        if (!threadId) {
          return errorResponse({
            message: "Missing thread id for durable chat session",
            status: 400,
            why: "Request is missing both `id` query param and `data.threadId`.",
            fix: "Pass `?id=<threadId>` in sendUrl or include `data.threadId` in the request payload.",
          });
        }

        if (!messages.some((message) => hasUsablePayload(message))) {
          return errorResponse({
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
            ? await hasV2MessageByIdServer({
                threadId,
                messageId: userMessageId,
              })
            : false;
        const isRegenerationTurn =
          hasNewUserTurn && hasPersistedLatestUserMessage;
        const shouldPersistUserTurn =
          hasNewUserTurn && hasUserTurn && !isRegenerationTurn;

        const streamPath = buildV2ChatStreamPath(threadId);
        const streamTarget = getDurableChatSessionTarget(streamPath);
        const conversationId = data?.conversationId ?? threadId;
        const requestHasMedia = userMessagesContainMedia(messages);

        const runtimePolicy = resolveV2RuntimePolicy({ data });

        const requestedModel =
          runtimePolicy.model ?? process.env.AZURE_OPENAI_DEPLOYMENT;
        if (requestHasMedia && !isVisionCapableModel(requestedModel)) {
          return errorResponse({
            message: "Model does not support image or document input",
            status: 415,
            why: `Selected model "${requestedModel ?? "unknown"}" cannot process image, audio, video, or document parts`,
            fix: "Select a vision-capable deployment (e.g. gpt-4o, gpt-4.1, gpt-5)",
          });
        }

        const toolRuntime = await resolveV2Tools({ policy: runtimePolicy });
        const lifecycleController = createV2RunLifecycleController({
          threadId,
        });

        const { stream: responseStream, runState } = await createV2AgentRun({
          messages: messages as V2AgentRunMessages,
          conversationId,
          model: runtimePolicy.model,
          runtimePolicy,
          tools: toolRuntime.tools,
          allowedToolNames: toolRuntime.allowedToolNames,
          middlewareFactory: () => [
            createV2RunLifecycleMiddleware(lifecycleController),
          ],
        });
        const renderedResponseStream = withV2JsonRenderEvents(responseStream);

        const newUserMessage = shouldPersistUserTurn
          ? extractLatestUserMessage(messages)
          : undefined;
        const newMessages: Array<DurableSessionMessage> = newUserMessage
          ? [newUserMessage]
          : [];

        await beginV2ThreadRun(threadId);
        let persistenceError: string | undefined;

        try {
          const response = await toDurableChatSessionResponse({
            stream: streamTarget,
            newMessages,
            responseStream: renderedResponseStream,
            mode: "await",
          });

          try {
            await projectV2StreamSnapshotToDb({
              threadId,
              replaceLatestAssistant: isRegenerationTurn,
            });
          } catch (error) {
            persistenceError = toErrorMessage(error);
          }

          const terminalEvents = buildV2TerminalEvents({
            threadId,
            runState,
            persistenceError,
          });

          try {
            await appendV2CustomEvents(streamTarget, terminalEvents);
          } catch {
            // Best effort: durable response already succeeded.
          }

          if (shouldPersistUserTurn && !persistenceError) {
            queueV2ThreadTitleGeneration({
              threadId,
              streamTarget,
            });
          }

          return response;
        } catch (error) {
          await lifecycleController.end();
          throw error;
        }
      },
    },
  },
});
