import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            error: "Legacy chat stream endpoint removed",
            fix: "Use /api/v2/chat-stream instead.",
          },
          { status: 410 },
        ),
    },
  },
});
