import { toServerSentEventsResponse } from "@tanstack/ai";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withPersistence } from "~/lib/chat-helpers";
import { prepareAutomationRun } from "~/lib/automation-agent";
import { errorResponse } from "~/lib/http-error";

const agentRequestSchema = z.object({
  prompt: z.string().min(1),
  threadId: z.string().optional(),
});

export const Route = createFileRoute("/api/agent")({
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

        const { prompt, threadId: existingThreadId } = agentRequestSchema.parse(
          await request.json(),
        );

        const prepared = await prepareAutomationRun(prompt, existingThreadId);

        return toServerSentEventsResponse(
          withPersistence(
            prepared.stream,
            prepared.threadId,
            prepared.threadCreated,
            prepared.prompt,
            prepared.userParts,
            true,
            prepared.runState,
          ),
        );
      },
    },
  },
});
