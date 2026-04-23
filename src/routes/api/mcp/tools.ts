import { createFileRoute } from "@tanstack/react-router";
import { listToolsForServer } from "~/lib/mcp/client";

export const Route = createFileRoute("/api/mcp/tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serverName } = await request.json();

        if (!serverName || typeof serverName !== "string") {
          return new Response(
            JSON.stringify({ error: "serverName is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const tools = await listToolsForServer(serverName);
          return new Response(JSON.stringify({ tools }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : "Failed to list tools",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
