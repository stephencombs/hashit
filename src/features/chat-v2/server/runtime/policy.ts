import {
  PROFILE_CONFIGS,
  resolveAgentModel,
  sanitizeCustomSystemPrompt,
  type AgentRunProfile,
} from "~/shared/lib/agent-profile-policy";
import type { V2ChatRequestData } from "../../contracts/chat-contract";

export const V2_AGENT_PROFILE: AgentRunProfile = "interactiveChatV2";

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
const MIN_TOOL_ITERATIONS = 1;
const MAX_TOOL_ITERATIONS = 20;

export type ResolvedV2RuntimePolicy = {
  model?: string;
  requestedModel?: string;
  temperature?: number;
  requestedTemperature?: number;
  maxToolIterations?: number;
  requestedMaxToolIterations?: number;
  customSystemPromptAllowed: boolean;
  customSystemPromptProvided: boolean;
  systemPrompts: Array<string>;
  includeMcpTools: boolean;
  includeHitlTools: boolean;
  lazyMcpTools: boolean;
  selectedServers: Array<string>;
  enabledTools: Record<string, Array<string>>;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueTrimmedStrings(
  values: Array<string> | undefined,
): Array<string> {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeEnabledTools(
  selectedServers: Array<string>,
  enabledTools: Record<string, Array<string>> | undefined,
): Record<string, Array<string>> {
  const normalized: Record<string, Array<string>> = {};
  for (const serverName of selectedServers) {
    normalized[serverName] = uniqueTrimmedStrings(enabledTools?.[serverName]);
  }
  return normalized;
}

export function resolveV2RuntimePolicy({
  data,
  extraSystemPrompts,
}: {
  data?: V2ChatRequestData;
  extraSystemPrompts?: Array<string>;
}): ResolvedV2RuntimePolicy {
  const profileConfig = PROFILE_CONFIGS[V2_AGENT_PROFILE];
  const requestedModel = data?.model?.trim() || undefined;
  const requestedTemperature =
    typeof data?.temperature === "number" ? data.temperature : undefined;
  const requestedMaxToolIterations =
    typeof data?.maxToolIterations === "number"
      ? data.maxToolIterations
      : undefined;
  const customSystemPrompt = sanitizeCustomSystemPrompt(data?.systemPrompt);
  const selectedServers = uniqueTrimmedStrings(data?.selectedServers);
  const enabledTools = normalizeEnabledTools(
    selectedServers,
    data?.enabledTools,
  );

  return {
    model: resolveAgentModel(V2_AGENT_PROFILE, requestedModel),
    requestedModel,
    temperature: profileConfig.allowTemperatureOverride
      ? requestedTemperature == null
        ? undefined
        : clampNumber(requestedTemperature, MIN_TEMPERATURE, MAX_TEMPERATURE)
      : undefined,
    requestedTemperature,
    maxToolIterations:
      requestedMaxToolIterations == null
        ? profileConfig.defaultMaxIterations
        : clampNumber(
            requestedMaxToolIterations,
            MIN_TOOL_ITERATIONS,
            MAX_TOOL_ITERATIONS,
          ),
    requestedMaxToolIterations,
    customSystemPromptAllowed: profileConfig.allowCustomSystemPrompt,
    customSystemPromptProvided: customSystemPrompt != null,
    systemPrompts: profileConfig.buildSystemPrompts({
      customSystemPrompt: profileConfig.allowCustomSystemPrompt
        ? customSystemPrompt
        : undefined,
      extraSystemPrompts,
    }),
    includeMcpTools: profileConfig.includeMcpTools,
    includeHitlTools: profileConfig.includeFormTool,
    lazyMcpTools: profileConfig.lazyMcpTools,
    selectedServers,
    enabledTools,
  };
}
