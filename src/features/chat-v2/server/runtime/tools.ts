import type { Tool } from "@tanstack/ai";
import { getMcpTools } from "~/features/mcp/server/client";
import { collectFormDataTool } from "~/shared/lib/form-tool";
import { resolveDuplicateEntityTool } from "~/shared/lib/resolve-duplicate-tool";
import type { ResolvedV2RuntimePolicy } from "./policy";

export const V2_LAZY_TOOL_DISCOVERY_NAME = "__lazy__tool__discovery__";

export type ResolvedV2ToolRuntime = {
  tools: Array<Tool>;
  allowedToolNames: Set<string>;
};

function toolName(tool: Tool): string | undefined {
  return (tool as { name?: unknown }).name as string | undefined;
}

function isLazyTool(tool: Tool): boolean {
  return (tool as { lazy?: unknown }).lazy === true;
}

export async function resolveV2Tools({
  policy,
}: {
  policy: ResolvedV2RuntimePolicy;
}): Promise<ResolvedV2ToolRuntime> {
  const tools: Array<Tool> = [];

  if (policy.includeHitlTools) {
    tools.push(collectFormDataTool, resolveDuplicateEntityTool);
  }

  if (policy.includeMcpTools && policy.selectedServers.length > 0) {
    const mcpTools = await getMcpTools({
      enabledTools: policy.enabledTools,
      lazy: policy.lazyMcpTools,
      selectedServers: policy.selectedServers,
    });
    tools.push(...mcpTools.tools);
  }

  const allowedToolNames = new Set(
    tools
      .map((tool) => toolName(tool))
      .filter((name): name is string => !!name),
  );
  if (tools.some(isLazyTool)) {
    allowedToolNames.add(V2_LAZY_TOOL_DISCOVERY_NAME);
  }

  return {
    tools,
    allowedToolNames,
  };
}
