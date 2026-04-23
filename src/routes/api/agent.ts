import { toServerSentEventsResponse } from "@tanstack/ai";
import { createFileRoute } from "@tanstack/react-router";
import { useRequest } from "nitro/context";
import { createError } from "evlog";
import { z } from "zod";
import type { RequestLogger } from "evlog";
import { withPersistence } from "~/lib/chat-helpers";
import { prepareAutomationRun } from "~/lib/automation-agent";
import { startAgentRunTrace } from "~/lib/telemetry/agent-spans";

const agentRequestSchema = z.object({
  prompt: z.string().min(1),
  threadId: z.string().optional(),
});

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest();
        const log = req.context.log as RequestLogger;

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

        const { prompt, threadId: existingThreadId } = agentRequestSchema.parse(
          await request.json(),
        );

        const traceState = startAgentRunTrace({
          profile: "automation",
          source: "automation-api",
          conversationId: existingThreadId,
          log,
          attributes: {
            "http.route": "/api/agent",
            "agent.thread_id": existingThreadId,
          },
        });

        const prepared = await prepareAutomationRun(
          prompt,
          existingThreadId,
          log,
          traceState,
        );

        log.set({
          threadId: prepared.threadId,
          threadCreated: prepared.threadCreated,
          source: "automation",
          traceId: traceState.traceId,
          spanId: traceState.spanId,
        });

        log.set({ phase: "stream_started" });

        return toServerSentEventsResponse(
          withPersistence(
            prepared.stream,
            prepared.threadId,
            prepared.threadCreated,
            prepared.prompt,
            prepared.userParts,
            true,
            log,
            prepared.telemetry,
          ),
        );
      },
    },
  },
});
