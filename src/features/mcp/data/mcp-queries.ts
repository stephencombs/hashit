import { queryOptions } from "@tanstack/react-query";

export interface ServerInfo {
  name: string;
  domain: string;
  description: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export const mcpKeys = {
  servers: ["mcp-servers"] as const,
  tools: (serverName: string) => ["mcp-tools", serverName] as const,
};

export function mcpServersQueryOptions() {
  return queryOptions({
    queryKey: mcpKeys.servers,
    queryFn: async (): Promise<ServerInfo[]> => {
      const res = await fetch("/api/mcp/servers");
      if (!res.ok) throw new Error("Failed to load servers");
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function mcpToolsQueryOptions(serverName: string) {
  return queryOptions({
    queryKey: mcpKeys.tools(serverName),
    queryFn: async (): Promise<ToolInfo[]> => {
      const res = await fetch("/api/mcp/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName }),
      });
      if (!res.ok) throw new Error("Failed to fetch tools");
      const data = (await res.json()) as { tools: ToolInfo[] };
      return data.tools;
    },
    staleTime: Infinity,
  });
}
