import { createFileRoute } from "@tanstack/react-router";
import { errorResponse } from "~/shared/lib/http-error";

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async () =>
        errorResponse({
          message: "Legacy agent streaming endpoint removed",
          status: 410,
          why: "The V1 chat persistence path has been deleted.",
          fix: "Use /api/v2/chat for interactive chat or the automations executor for scheduled prompt runs.",
        }),
    },
  },
});
