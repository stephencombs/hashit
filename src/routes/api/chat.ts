import { createFileRoute } from "@tanstack/react-router";
import { errorResponse } from "~/shared/lib/http-error";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async () =>
        errorResponse({
          message: "Legacy chat endpoint removed",
          status: 410,
          why: "The V1 chat implementation has been deleted.",
          fix: "Use /api/v2/chat instead.",
        }),
    },
  },
});
