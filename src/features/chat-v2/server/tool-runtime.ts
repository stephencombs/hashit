import type { Tool } from "@tanstack/ai";
import { collectFormDataTool } from "~/lib/form-tool";
import { getMcpTools } from "~/lib/mcp/client";
import { resolveDuplicateEntityTool } from "~/lib/resolve-duplicate-tool";
import type { ResolvedV2RuntimePolicy } from "./runtime-policy";

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
  const hasLazyTools = tools.some(isLazyTool);
  if (hasLazyTools) {
    allowedToolNames.add(V2_LAZY_TOOL_DISCOVERY_NAME);
  }

  const result: ResolvedV2ToolRuntime = {
    tools,
    allowedToolNames,
  };

  return result;
}
