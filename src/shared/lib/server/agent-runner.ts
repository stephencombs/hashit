import {
  chat,
  maxIterations,
  type ChatMiddleware,
  type ErrorInfo,
  type FinishInfo,
  type StreamChunk,
  type Tool,
} from "@tanstack/ai";
import {
  getMcpTools,
  type GetMcpToolsOptions,
} from "~/features/mcp/server/client";
import { collectFormDataTool } from "~/shared/lib/form-tool";
import { getAzureAdapter } from "~/shared/lib/openai-adapter";
import { resolveDuplicateEntityTool } from "~/shared/lib/resolve-duplicate-tool";
import {
  PROFILE_CONFIGS,
  resolveAgentModel,
  sanitizeCustomSystemPrompt,
  type AgentRunProfile,
} from "~/shared/lib/agent-profile-policy";

/**
 * TanStack AI injects this synthetic tool when any tool has `lazy: true`
 * (see LazyToolManager in @tanstack/ai). It is not part of the `tools` array
 * we pass to `chat()`, so policy checks must allow it explicitly.
 */
const LAZY_TOOL_DISCOVERY_NAME = "__lazy__tool__discovery__";

export type AgentRunStatus =
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "aborted";

export interface AgentRunState {
  status: AgentRunStatus;
  finishReason?: string | null;
  error?: string;
}

interface CreateAgentRunOptions {
  profile: AgentRunProfile;
  messages: NonNullable<Parameters<typeof chat>[0]["messages"]>;
  conversationId?: string;
  model?: string;
  temperature?: number;
  customSystemPrompt?: string;
  selectedServers?: string[];
  enabledTools?: Record<string, string[]>;
  extraTools?: Tool[];
  extraSystemPrompts?: string[];
  maxToolIterations?: number;
}

export function createAgentRunState(): AgentRunState {
  return {
    status: "running",
  };
}

function createRunStateMiddleware(
  runState: AgentRunState,
  allowedToolNames?: Set<string>,
): ChatMiddleware {
  return {
    name: "agent-runtime-state",
    onBeforeToolCall(_ctx, hookCtx) {
      if (allowedToolNames && !allowedToolNames.has(hookCtx.toolName)) {
        runState.status = "aborted";
        runState.error = `Tool blocked by profile policy: ${hookCtx.toolName}`;
        return {
          type: "abort" as const,
          reason: runState.error,
        };
      }

      return undefined;
    },
    onFinish(_ctx, info: FinishInfo) {
      runState.status = "completed";
      runState.finishReason = info.finishReason;
    },
    onAbort(_ctx, info) {
      runState.status = "aborted";
      runState.error = info.reason;
    },
    onError(_ctx, info: ErrorInfo) {
      runState.status = "failed";
      runState.error =
        info.error instanceof Error ? info.error.message : String(info.error);
    },
  };
}

export async function createAgentRun({
  profile,
  messages,
  conversationId,
  model,
  temperature,
  customSystemPrompt,
  selectedServers,
  enabledTools,
  extraTools = [],
  extraSystemPrompts = [],
  maxToolIterations,
}: CreateAgentRunOptions): Promise<{
  stream: AsyncIterable<StreamChunk>;
  runState: AgentRunState;
}> {
  const profileConfig = PROFILE_CONFIGS[profile];
  const resolvedModel = resolveAgentModel(profile, model);
  const adapter = getAzureAdapter(resolvedModel);
  const modelName = resolvedModel || process.env.AZURE_OPENAI_DEPLOYMENT!;
  const supportsReasoning = /gpt-5|o[1-9]/.test(modelName);

  const sanitizedPrompt = profileConfig.allowCustomSystemPrompt
    ? sanitizeCustomSystemPrompt(customSystemPrompt)
    : undefined;

  const systemPrompts = profileConfig.buildSystemPrompts({
    customSystemPrompt: sanitizedPrompt,
    extraSystemPrompts,
  });

  const mcpOptions: GetMcpToolsOptions = {
    lazy: profileConfig.lazyMcpTools,
  };
  const mcpTools = profileConfig.includeMcpTools
    ? await getMcpTools(selectedServers, enabledTools, mcpOptions)
    : [];

  const tools: Tool[] = [
    ...(profileConfig.includeFormTool
      ? [collectFormDataTool, resolveDuplicateEntityTool]
      : []),
    ...extraTools,
    ...mcpTools,
  ];

  const runState = createAgentRunState();

  const allowedToolNames = new Set(tools.map((tool) => tool.name));
  if (tools.some((tool) => tool.lazy)) {
    allowedToolNames.add(LAZY_TOOL_DISCOVERY_NAME);
  }

  const stream = chat({
    adapter,
    messages,
    conversationId,
    ...(!supportsReasoning &&
      profileConfig.allowTemperatureOverride &&
      temperature !== undefined && { temperature }),
    ...(systemPrompts.length > 0 && { systemPrompts }),
    ...(tools.length > 0 && { tools }),
    ...(maxToolIterations || profileConfig.defaultMaxIterations
      ? {
          agentLoopStrategy: maxIterations(
            maxToolIterations ?? profileConfig.defaultMaxIterations!,
          ),
        }
      : {}),
    ...(supportsReasoning && {
      modelOptions: {
        reasoning: { effort: "low", summary: "auto" },
      },
    }),
    middleware: [createRunStateMiddleware(runState, allowedToolNames)],
  });

  return { stream, runState };
}
