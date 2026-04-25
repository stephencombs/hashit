import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { z } from "zod";
import { submitV3ChatTurn } from "~/features/chat-v3/server";
import { errorResponse, toErrorResponse } from "~/shared/lib/http-error";

const uiMessageSchema = z.custom<UIMessage>(
  (value) => value != null && typeof value === "object",
  "Expected an AI SDK UIMessage object",
);

const v3ChatRequestSchema = z.object({
  id: z.string().min(1).max(128),
  messages: z.array(uiMessageSchema).min(1),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(4000).optional(),
});

export const Route = createFileRoute("/api/v3/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => undefined);
        const parsedBody = v3ChatRequestSchema.safeParse(body);
        if (!parsedBody.success) {
          return errorResponse({
            message: "Invalid V3 chat request payload",
            status: 400,
            why:
              parsedBody.error.issues[0]?.message ??
              "Request body does not match schema",
            fix: "Send a payload with `id` and AI SDK `messages`.",
          });
        }

        try {
          return await submitV3ChatTurn(parsedBody.data);
        } catch (error) {
          return (
            toErrorResponse(error) ??
            errorResponse({
              message: "V3 chat request failed",
              status: 500,
              why:
                error instanceof Error
                  ? error.message
                  : "Unexpected server error",
            })
          );
        }
      },
    },
  },
});
