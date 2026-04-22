import { createFileRoute } from "@tanstack/react-router";
import { useRequest } from "nitro/context";
import { createError } from "evlog";
import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from "@durable-streams/tanstack-ai-transport";
import type { RequestLogger } from "evlog";
import {
  getDurableChatSessionTarget,
} from "~/lib/durable-streams";
import { beginThreadRun, endThreadRun } from "~/lib/server/thread-run-state";
import { createV2AgentRun } from "~/features/chat-v2/server/agent-runner";
import {
  optimizeV2MessagesForTokenEfficiency,
  v2ChatRequestSchema,
} from "~/features/chat-v2/server/chat-contract";
import { buildV2ChatStreamPath, toV2RunStateKey } from "~/features/chat-v2/server/keys";
import { createV2PersistenceMiddleware } from "~/features/chat-v2/server/persistence";
import { createV2RunLifecycleMiddleware } from "~/features/chat-v2/server/run-lifecycle-middleware";
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
            why: parsedBody.error.issues[0]?.message ?? "Request body does not match schema",
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

        const optimization = optimizeV2MessagesForTokenEfficiency(messages, {
          maxInputMessages: data?.maxInputMessages,
          maxPartChars: data?.maxPartChars,
        });
        if (optimization.messages.length === 0) {
          throw createError({
            message: "V2 request has no usable message content after optimization",
            status: 400,
            why: "All input messages were empty or filtered by token budget safeguards.",
            fix: "Send at least one message with text content.",
          });
        }

        log.set({
          route: "/api/v2/chat",
          requestMessageCount: messages.length,
          optimizedMessageCount: optimization.messages.length,
          droppedMessages: optimization.stats.droppedMessages,
          droppedParts: optimization.stats.droppedParts,
          truncatedFields: optimization.stats.truncatedFields,
        });

        const runKey = toV2RunStateKey(threadId);
        const {
          id: userMessageId,
          content: userContent,
          parts: userParts,
        } = extractV2UserMessage(messages);

        const latestMessage = messages[messages.length - 1];
        const hasNewUserTurn = latestMessage?.role === "user";
        const hasUserTurn = userContent.length > 0 || userParts.length > 0;
        const shouldPersistUserTurn = hasNewUserTurn && hasUserTurn;

        const streamPath = buildV2ChatStreamPath(threadId);
        const streamTarget = getDurableChatSessionTarget(streamPath);
        const conversationId = data?.conversationId ?? threadId;

        const { stream: responseStream } = await createV2AgentRun({
          messages: optimization.messages as Array<Record<string, unknown>>,
          conversationId,
          model: data?.model,
          log,
          middlewareFactory: (telemetry) => [
            createV2PersistenceMiddleware({
              threadId,
              userContent,
              userParts,
              persistUserTurn: shouldPersistUserTurn,
              telemetry,
              log,
              userMessageId,
            }),
            createV2RunLifecycleMiddleware({ runKey, log }),
          ],
        });

        const newUserMessage = shouldPersistUserTurn
          ? extractLatestUserMessage(messages)
          : undefined;
        const newMessages: Array<DurableSessionMessage> = newUserMessage
          ? [newUserMessage]
          : [];

        beginThreadRun(runKey);
        try {
          return toDurableChatSessionResponse({
            stream: streamTarget,
            newMessages,
            responseStream,
            mode: "await",
          });
        } catch (error) {
          endThreadRun(runKey);
          throw error;
        }
      },
    },
  },
});
