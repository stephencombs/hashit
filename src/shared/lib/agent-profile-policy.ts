import { uiCatalog } from "~/shared/lib/ui-catalog";

export type AgentRunProfile =
  | "interactiveChat"
  | "interactiveChatV2"
  | "automation"
  | "dashboardPlanning"
  | "dashboardRender";

export interface RunProfileConfig {
  includeFormTool: boolean;
  includeMcpTools: boolean;
  lazyMcpTools: boolean;
  allowCustomSystemPrompt: boolean;
  allowModelOverride: boolean;
  allowTemperatureOverride: boolean;
  defaultMaxIterations?: number;
  buildSystemPrompts: (options: {
    customSystemPrompt?: string;
    extraSystemPrompts?: string[];
  }) => string[];
}

const CHAT_CATALOG_RULES = [
  'You may generate multiple visualizations in a single response when the user requests it or when the data naturally calls for it (e.g. "show sales and headcount" -> two charts). Each visualization must be a separate spec block.',
  "Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.",
  "When using DataGrid, include ALL rows in a single DataGrid with pagination enabled. Never split data across multiple responses or render tabular data as text.",
  "Only use component types that are explicitly listed in this catalog (AreaChart, BarChart, LineChart, PieChart, RadarChart, RadialChart, DataGrid). Do NOT invent container or layout types such as Card, Container, Layout, Section, Panel, or Wrapper — they are not supported and will cause a render failure. Every spec root must be one of the listed visualization components.",
];

const FORM_RULE =
  "Use the collect_form_data tool when you need structured input from the user (e.g. registration, configuration, multi-field queries). Do not ask for multiple pieces of information via plain text when a form would be clearer. After calling collect_form_data, end your turn immediately with no text - the user must fill and submit the form before you respond again.";

const DUPLICATE_RESOLUTION_RULE =
  "When an MCP tool returns a uniqueness, duplicate, or conflict error, call resolve_duplicate_entity immediately. " +
  "Populate fields with both the existing (currentValue) and proposed (proposedValue) values. " +
  "Mark the conflicting fields with conflicting: true. " +
  "Provide clear resolution actions (e.g. retry with a different value, overwrite/force, skip). " +
  "Do NOT print markdown tables, do NOT ask the user to reply with corrected values in chat. " +
  "After calling resolve_duplicate_entity, end your turn immediately with no text and wait for the user to pick a resolution.";

const V2_CORE_SYSTEM_PROMPT =
  "You are Teammate V2. Provide concise, direct answers. Keep wording compact and avoid unnecessary explanation unless the user asks for detail.";

const V2_TOKEN_RULE =
  "Prefer using existing conversation context and avoid repeating long boilerplate. When context is missing, ask one focused clarifying question.";

export function sanitizeCustomSystemPrompt(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 4000);
}

export const PROFILE_CONFIGS: Record<AgentRunProfile, RunProfileConfig> = {
  interactiveChat: {
    includeFormTool: true,
    includeMcpTools: true,
    lazyMcpTools: true,
    allowCustomSystemPrompt: true,
    allowModelOverride: true,
    allowTemperatureOverride: true,
    defaultMaxIterations: 5,
    buildSystemPrompts: ({ customSystemPrompt, extraSystemPrompts }) => {
      const prompts = [
        ...(customSystemPrompt ? [customSystemPrompt] : []),
        uiCatalog.prompt({
          mode: "inline",
          customRules: [
            ...CHAT_CATALOG_RULES,
            FORM_RULE,
            DUPLICATE_RESOLUTION_RULE,
          ],
        }),
      ];
      if (extraSystemPrompts?.length) prompts.push(...extraSystemPrompts);
      return prompts;
    },
  },
  interactiveChatV2: {
    includeFormTool: true,
    includeMcpTools: true,
    lazyMcpTools: true,
    allowCustomSystemPrompt: true,
    allowModelOverride: true,
    allowTemperatureOverride: true,
    defaultMaxIterations: 5,
    buildSystemPrompts: ({ customSystemPrompt, extraSystemPrompts }) => {
      const prompts = [
        ...(customSystemPrompt ? [customSystemPrompt] : []),
        V2_CORE_SYSTEM_PROMPT,
        V2_TOKEN_RULE,
        uiCatalog.prompt({
          mode: "inline",
          customRules: [
            ...CHAT_CATALOG_RULES,
            FORM_RULE,
            DUPLICATE_RESOLUTION_RULE,
          ],
        }),
      ];
      if (extraSystemPrompts?.length) prompts.push(...extraSystemPrompts);
      return prompts;
    },
  },
  automation: {
    includeFormTool: false,
    includeMcpTools: true,
    lazyMcpTools: true,
    allowCustomSystemPrompt: false,
    allowModelOverride: false,
    allowTemperatureOverride: false,
    defaultMaxIterations: 5,
    buildSystemPrompts: ({ extraSystemPrompts }) => {
      const prompts = [
        uiCatalog.prompt({
          mode: "inline",
          customRules: CHAT_CATALOG_RULES,
        }),
      ];
      if (extraSystemPrompts?.length) prompts.push(...extraSystemPrompts);
      return prompts;
    },
  },
  dashboardPlanning: {
    includeFormTool: false,
    includeMcpTools: false,
    lazyMcpTools: false,
    allowCustomSystemPrompt: false,
    allowModelOverride: false,
    allowTemperatureOverride: false,
    defaultMaxIterations: 2,
    buildSystemPrompts: ({ extraSystemPrompts }) => extraSystemPrompts ?? [],
  },
  dashboardRender: {
    includeFormTool: false,
    includeMcpTools: false,
    lazyMcpTools: false,
    allowCustomSystemPrompt: false,
    allowModelOverride: false,
    allowTemperatureOverride: false,
    buildSystemPrompts: ({ extraSystemPrompts }) => extraSystemPrompts ?? [],
  },
};

export function resolveAgentModel(
  profile: AgentRunProfile,
  requestedModel?: string,
): string | undefined {
  const profileConfig = PROFILE_CONFIGS[profile];
  if (!profileConfig.allowModelOverride) {
    return undefined;
  }
  return requestedModel?.trim() || undefined;
}
