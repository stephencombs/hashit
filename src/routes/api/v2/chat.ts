import { createFileRoute } from "@tanstack/react-router";
import { v2ChatRequestSchema } from "~/features/chat-v2/contracts/chat-contract";
import { submitV2ChatTurn } from "~/features/chat-v2/server";
import { errorResponse, toErrorResponse } from "~/shared/lib/http-error";

export const Route = createFileRoute("/api/v2/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        try {
          return await submitV2ChatTurn({
            threadId,
            messages,
            data,
          });
        } catch (error) {
          return (
            toErrorResponse(error) ??
            errorResponse({
              message: "V2 chat request failed",
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
