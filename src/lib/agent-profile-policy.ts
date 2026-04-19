import { uiCatalog } from '~/lib/ui-catalog'

export type AgentRunProfile =
  | 'interactiveChat'
  | 'automation'
  | 'dashboardPlanning'
  | 'dashboardRender'

export interface RunProfileConfig {
  includePlanTool: boolean
  includeFormTool: boolean
  includeMcpTools: boolean
  lazyMcpTools: boolean
  allowCustomSystemPrompt: boolean
  allowModelOverride: boolean
  allowTemperatureOverride: boolean
  defaultMaxIterations?: number
  buildSystemPrompts: (options: {
    customSystemPrompt?: string
    extraSystemPrompts?: string[]
  }) => string[]
}

const CHAT_CATALOG_RULES = [
  'You may generate multiple visualizations in a single response when the user requests it or when the data naturally calls for it (e.g. "show sales and headcount" -> two charts). Each visualization must be a separate spec block.',
  'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
  'When using DataGrid, include ALL rows in a single DataGrid with pagination enabled. Never split data across multiple responses or render tabular data as text.',
  'Only use component types that are explicitly listed in this catalog (AreaChart, BarChart, LineChart, PieChart, RadarChart, RadialChart, DataGrid). Do NOT invent container or layout types such as Card, Container, Layout, Section, Panel, or Wrapper — they are not supported and will cause a render failure. Every spec root must be one of the listed visualization components.',
]

const FORM_RULE =
  'Use the collect_form_data tool when you need structured input from the user (e.g. registration, configuration, multi-field queries). Do not ask for multiple pieces of information via plain text when a form would be clearer. After calling collect_form_data, end your turn immediately with no text - the user must fill and submit the form before you respond again.'

export function sanitizeCustomSystemPrompt(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 4000)
}

export const PROFILE_CONFIGS: Record<AgentRunProfile, RunProfileConfig> = {
  interactiveChat: {
    includePlanTool: true,
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
          mode: 'inline',
          customRules: [...CHAT_CATALOG_RULES, FORM_RULE],
        }),
      ]
      if (extraSystemPrompts?.length) prompts.push(...extraSystemPrompts)
      return prompts
    },
  },
  automation: {
    includePlanTool: false,
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
          mode: 'inline',
          customRules: CHAT_CATALOG_RULES,
        }),
      ]
      if (extraSystemPrompts?.length) prompts.push(...extraSystemPrompts)
      return prompts
    },
  },
  dashboardPlanning: {
    includePlanTool: false,
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
    includePlanTool: false,
    includeFormTool: false,
    includeMcpTools: false,
    lazyMcpTools: false,
    allowCustomSystemPrompt: false,
    allowModelOverride: false,
    allowTemperatureOverride: false,
    buildSystemPrompts: ({ extraSystemPrompts }) => extraSystemPrompts ?? [],
  },
}

export function resolveAgentModel(
  profile: AgentRunProfile,
  requestedModel?: string,
): string | undefined {
  const profileConfig = PROFILE_CONFIGS[profile]
  if (!profileConfig.allowModelOverride) {
    return undefined
  }
  return requestedModel?.trim() || undefined
}
