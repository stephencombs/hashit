import { createFileRoute } from "@tanstack/react-router";
import { useRequest } from "nitro/context";
import { createError } from "evlog";
import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from "@durable-streams/tanstack-ai-transport";
import type { RequestLogger } from "evlog";
import { getDurableChatSessionTarget } from "~/lib/durable-streams";
import { createV2AgentRun } from "~/features/chat-v2/server/agent-runner";
import { v2ChatRequestSchema } from "~/features/chat-v2/server/chat-contract";
import { buildV2ChatStreamPath } from "~/features/chat-v2/server/keys";
import {
  appendV2CustomEvents,
  buildV2TerminalEvents,
  createV2PersistenceMiddleware,
  finalizeV2PersistenceTelemetry,
} from "~/features/chat-v2/server/persistence-runtime";
import { hasV2MessageByIdServer } from "~/features/chat-v2/server/messages.server";
import { createV2RunLifecycleMiddleware } from "~/features/chat-v2/server/run-lifecycle-middleware";
import { withV2JsonRenderEvents } from "~/features/chat-v2/server/json-render-events";
import { projectV2StreamSnapshotToDb } from "~/features/chat-v2/server/stream-projection";
import {
  beginV2ThreadRun,
  endV2ThreadRun,
} from "~/features/chat-v2/server/thread-run-state.server";
import { queueV2ThreadTitleGeneration } from "~/features/chat-v2/server/thread-title";
import { extractV2UserMessage } from "~/features/chat-v2/server/user-message";

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
        const req = useRequest();
        const log = req.context?.log as RequestLogger;

        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          throw createError({
            message: "Azure OpenAI environment variables not configured",
            status: 500,
            why: "Missing one or more required environment variables",
            fix: "Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT",
          });
        }

        const body = await request.json().catch(() => undefined);
        const parsedBody = v2ChatRequestSchema.safeParse(body);
        if (!parsedBody.success) {
          throw createError({
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
          throw createError({
            message: "Missing thread id for durable chat session",
            status: 400,
            why: "Request is missing both `id` query param and `data.threadId`.",
            fix: "Pass `?id=<threadId>` in sendUrl or include `data.threadId` in the request payload.",
          });
        }

        if (!messages.some((message) => hasUsablePayload(message))) {
          throw createError({
            message: "V2 request has no usable message content",
            status: 400,
            why: "All input messages are empty.",
            fix: "Send at least one message with text content.",
          });
        }

        log.set({
          route: "/api/v2/chat",
          requestMessageCount: messages.length,
        });

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

        const { stream: responseStream, telemetry } = await createV2AgentRun({
          messages: messages as Array<Record<string, unknown>>,
          conversationId,
          model: data?.model,
          log,
          middlewareFactory: (telemetry) => [
            createV2PersistenceMiddleware({
              threadId,
              telemetry,
              log,
            }),
            createV2RunLifecycleMiddleware({ threadId, log }),
          ],
        });
        const renderedResponseStream = withV2JsonRenderEvents(
          responseStream,
          (metrics) => {
            log.set({
              v2UiGenPatchLinesReceived: metrics.patchLinesReceived,
              v2UiGenPatchesEmitted: metrics.patchesEmitted,
              v2UiGenSpecsCompleted: metrics.specsCompleted,
              v2UiGenTotalMs: metrics.totalMs,
            });
          },
        );

        const newUserMessage = shouldPersistUserTurn
          ? extractLatestUserMessage(messages)
          : undefined;
        const newMessages: Array<DurableSessionMessage> = newUserMessage
          ? [newUserMessage]
          : [];

        await beginV2ThreadRun(threadId);
        let persistenceError: string | undefined;
        let eventError: string | undefined;
        let persistenceFinalized = false;

        const finalizePersistence = (): void => {
          if (persistenceFinalized) return;
          persistenceFinalized = true;
          finalizeV2PersistenceTelemetry({
            threadId,
            telemetry,
            persistenceError,
            eventError,
          });
        };

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
              telemetry,
              persistUserTurn: shouldPersistUserTurn,
              replaceLatestAssistant: isRegenerationTurn,
              userMessageId,
              log,
            });
          } catch (error) {
            persistenceError = toErrorMessage(error);
            log.set({
              v2ProjectionError: persistenceError,
            });
          }

          const terminalEvents = buildV2TerminalEvents({
            threadId,
            telemetry,
            persistenceError,
          });

          try {
            await appendV2CustomEvents(streamTarget, terminalEvents);
          } catch (error) {
            eventError = toErrorMessage(error);
            log.set({
              v2PersistenceEventAppendError: eventError,
            });
          }

          if (shouldPersistUserTurn && !persistenceError) {
            queueV2ThreadTitleGeneration({
              threadId,
              streamTarget,
              log,
            });
          }

          finalizePersistence();
          return response;
        } catch (error) {
          await endV2ThreadRun(threadId);
          if (!persistenceError) {
            persistenceError = toErrorMessage(error);
          }
          finalizePersistence();
          throw error;
        }
      },
    },
  },
});
