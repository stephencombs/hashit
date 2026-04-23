import { createFileRoute } from "@tanstack/react-router";
import { MCP_SERVERS } from "~/lib/mcp/config";

export const Route = createFileRoute("/api/mcp/servers")({
  server: {
    handlers: {
      GET: async () => {
        const servers = MCP_SERVERS.filter((s) => s.enabled).map(
          ({ name, domain, description }) => ({ name, domain, description }),
        );
        return new Response(JSON.stringify(servers), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
