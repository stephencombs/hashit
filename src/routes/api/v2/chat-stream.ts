import { createFileRoute } from "@tanstack/react-router";
import { proxyV2ChatStreamRead } from "~/features/chat-v2/server";

export const Route = createFileRoute("/api/v2/chat-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => proxyV2ChatStreamRead(request),
    },
  },
});
