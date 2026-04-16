import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { dashboardSnapshots } from '../../src/db/schema'
import { uiCatalog } from '../../src/lib/ui-catalog'
import { withJsonRender } from '../../src/lib/json-render-stream'
import { getAllMcpTools } from '../../src/lib/mcp/client'
import { getAzureAdapter } from '../../src/lib/chat-helpers'
import type { ServerTool, Tool } from '@tanstack/ai'
import type { PersistedWidget, PersistedRecipe } from '../../src/db/schema'
import type { Spec } from '@json-render/core'

interface DataSource {
  toolName: string
  toolParams: Record<string, unknown>
  label: string
}

interface WidgetRecipe {
  widgetId: string
  title: string
  insight: string
  dataSources: DataSource[]
  render: string
  score: number
}

const submitRecipesTool = toolDefinition({
  name: 'submit_widget_recipes',
  description: 'Submit the finalized insight-driven widget recipes for the dashboard',
  inputSchema: {
    type: 'object',
    properties: {
      recipes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            widgetId: { type: 'string', description: 'Kebab-case identifier (e.g. "onboarding-pipeline")' },
            title: { type: 'string', description: 'Human-readable widget title (e.g. "Onboarding Pipeline Status")' },
            insight: { type: 'string', description: 'The analytical question this widget answers (e.g. "How many new hires are stalled in onboarding?")' },
            dataSources: { type: 'string', description: 'JSON-serialized array of {toolName, toolParams, label} objects. toolName MUST be copied verbatim from Available Tools. label is a short snake_case key for referencing the data.' },
            render: { type: 'string', description: 'Natural-language render instructions explaining how to visualize the combined data to answer the insight question' },
            score: { type: 'number', description: 'Priority score 0-100 based on urgency, impact, and actionability for the persona' },
          },
          required: ['widgetId', 'title', 'insight', 'dataSources', 'render', 'score'],
          additionalProperties: false,
        },
      },
    },
    required: ['recipes'],
    additionalProperties: false,
  } as Tool['inputSchema'],
}).server(async (args: unknown) => args)

function formatWidgetId(widgetId: string): string {
  return widgetId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function stripSchemaMetadata(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(schema)) {
    if (key === 'additionalProperties' || key === 'description') continue
    if (key === 'properties' && typeof val === 'object' && val !== null) {
      const props: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(val as Record<string, unknown>)) {
        props[pk] = typeof pv === 'object' && pv !== null
          ? stripSchemaMetadata(pv as Record<string, unknown>)
          : pv
      }
      cleaned[key] = props
    } else if (key === 'items' && typeof val === 'object' && val !== null) {
      cleaned[key] = stripSchemaMetadata(val as Record<string, unknown>)
    } else {
      cleaned[key] = val
    }
  }
  return cleaned
}

function buildToolManifest(tools: ServerTool[]): string {
  return tools
    .map((t) => {
      const schema = (t.inputSchema as Record<string, unknown>) || {}
      const compact = stripSchemaMetadata(schema)
      return `### ${t.name}\n${t.description || ''}\nSchema:\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``
    })
    .join('\n\n')
}

async function runPlanningPhase(
  persona: string,
  mcpTools: ServerTool[],
  previousWidgetIds: string[],
): Promise<WidgetRecipe[]> {
  const adapter = getAzureAdapter()
  const toolManifest = buildToolManifest(mcpTools)

  const sampleToolName = mcpTools.length > 0 ? mcpTools[0].name : 'ServerName__tool_name'

  const previousSection = previousWidgetIds.length > 0
    ? `\n## Previously Generated — DO NOT REPEAT
The following widget IDs were generated in the last cycle. Choose DIFFERENT insights that complement (not duplicate) these:
${previousWidgetIds.map((id) => `- ${id}`).join('\n')}

Generate fresh, unique insights. Do NOT reuse any of the above widget IDs or cover the same analytical question.\n`
    : ''

  const planningPrompt = `You are a dashboard insight planner for an HR application. Your job is to identify the most urgent, actionable insights for the "${persona}" persona, then determine which tool(s) answer each insight.

## Available Tools (use EXACT names)
${toolManifest}

## CRITICAL — Tool Name Rules
Every toolName in dataSources MUST be copied character-for-character from the tool headings above.
Do NOT invent, simplify, or abbreviate tool names.
Tool names follow the pattern "ServerName__action_name" with a double underscore.
Example CORRECT: "${sampleToolName}"
Example INCORRECT: "get_employees", "list_active_employees", "employees"

## CRITICAL — toolParams Rules
Each toolParams object MUST match the Schema shown for its tool exactly.
- Read the Schema for each tool carefully. If it has a top-level "request" property of type "object", you MUST wrap parameters inside {"request": {...}}.
- For company/client identifier fields (companyId, company_id, clientId, client_id), always use value "207676".
- Only include parameters that exist in the schema. Do not invent parameter names.
- Prefer tools whose schemas you can fully satisfy. Avoid tools that require IDs you don't have (e.g. specific employeeId, paygroupUid).

Example: If a tool's schema is {"properties":{"request":{"type":"object","properties":{"companyId":{"type":"string"}},"required":["companyId"]}},"required":["request"]}
Then toolParams MUST be: {"request":{"companyId":"207676"}}
NOT: {"company_id":"207676"} — this is WRONG because it doesn't match the schema structure.
${previousSection}
## Insight Planning Instructions

Think like an ${persona}. Identify the 6 most urgent/actionable insights, NOT raw data dumps.

Good insights answer questions like:
- "Are there compliance risks?" (expiring certs, missing documents, overdue reviews)
- "What needs my attention today?" (pending approvals, onboarding blockers, open positions)
- "How healthy is my workforce?" (headcount trends, turnover, department distribution)
- "Are there data quality issues?" (employees missing emails, incomplete profiles)

Bad insights are raw reference dumps:
- "List of all asset types" — skip unless combined with actual asset assignments
- "Leave configuration table" — skip, this is admin config not actionable data
- "Work location catalog" — skip, reference data with no analytical value

Each widget can (and should when it adds value) combine data from MULTIPLE tools to produce a richer insight. For example:
- Combine employee list + new hire list to show "Onboarding Pipeline vs. Total Headcount"
- Combine employee list + termination data to show "Recent Turnover Analysis"
- Use a single tool for focused insights like "Upcoming Certification Expirations"

## Output Format

For each insight, provide:
- widgetId: kebab-case identifier
- title: human-readable widget title
- insight: the analytical question this widget answers
- dataSources: JSON array of {toolName, toolParams, label} objects. Each label is a short snake_case key (e.g. "roster", "new_hires") used to reference the data in render instructions.
- render: how to visualize the combined data to answer the insight. Reference data sources by their label. Specify chart type (DataGrid, BarChart, PieChart, etc.), axis mapping, and what the visualization should highlight.
- score: 0-100 based on urgency, actionability, and impact for the persona

## Examples

### Single-tool insight
widgetId: "headcount-by-department"
title: "Headcount by Department"
insight: "How is the workforce distributed across departments?"
dataSources: [{"toolName": "${sampleToolName}", "toolParams": {"request": {"companyId": "207676"}}, "label": "employees"}]
render: "Group employees by department. PieChart showing department distribution with counts. Highlight the largest and smallest departments."
score: 75

### Multi-tool insight
widgetId: "onboarding-pipeline"
title: "Onboarding Pipeline Status"
insight: "How many new hires are in progress and what's the completion rate?"
dataSources: [
  {"toolName": "HR_Onboarding__get_new_hires", "toolParams": {"request": {"companyId": "207676"}}, "label": "new_hires"},
  {"toolName": "${sampleToolName}", "toolParams": {"request": {"companyId": "207676"}}, "label": "roster"}
]
render: "Compare new_hires count to roster total to show onboarding as % of workforce. BarChart showing onboarding stages. Highlight any stalled hires."
score: 90

Call submit_widget_recipes with your recipes sorted by score (highest first). Produce exactly 6 recipes.
`

  const stream = chat({
    adapter,
    messages: [{ role: 'user' as const, content: planningPrompt }],
    tools: [submitRecipesTool],
    agentLoopStrategy: maxIterations(2),
  })

  let recipes: WidgetRecipe[] = []
  let toolCalled = false

  for await (const chunk of stream) {
    if (chunk.type === 'TOOL_CALL_END' && chunk.result) {
      toolCalled = true
      try {
        const parsed = JSON.parse(chunk.result) as {
          recipes?: Array<{
            widgetId: string
            title: string
            insight: string
            dataSources: string | DataSource[]
            render: string
            score: number
          }>
        }
        if (parsed.recipes) {
          for (const r of parsed.recipes) {
            let dataSources: DataSource[] = []
            if (typeof r.dataSources === 'string') {
              try {
                const raw = JSON.parse(r.dataSources) as Array<{
                  toolName: string
                  toolParams: string | Record<string, unknown>
                  label: string
                }>
                dataSources = raw.map((ds) => ({
                  toolName: ds.toolName,
                  label: ds.label,
                  toolParams:
                    typeof ds.toolParams === 'string'
                      ? (JSON.parse(ds.toolParams) as Record<string, unknown>)
                      : ds.toolParams || {},
                }))
              } catch {
                console.warn(`[dashboard] Failed to parse dataSources for "${r.widgetId}": ${r.dataSources}`)
                continue
              }
            } else if (Array.isArray(r.dataSources)) {
              dataSources = r.dataSources.map((ds) => ({
                toolName: ds.toolName,
                label: ds.label,
                toolParams:
                  typeof ds.toolParams === 'string'
                    ? (JSON.parse(ds.toolParams as unknown as string) as Record<string, unknown>)
                    : ds.toolParams || {},
              }))
            }
            if (dataSources.length === 0) {
              console.warn(`[dashboard] Skipping recipe "${r.widgetId}": no data sources`)
              continue
            }
            recipes.push({
              widgetId: r.widgetId,
              title: r.title || formatWidgetId(r.widgetId),
              insight: r.insight || r.render,
              dataSources,
              render: r.render,
              score: r.score,
            })
          }
        }
      } catch (err) {
        console.error('[dashboard] Failed to parse planning result:', err)
      }
    }
  }

  if (!toolCalled) {
    console.warn(`[dashboard] Planning LLM did not call submit_widget_recipes. Tools in manifest: ${mcpTools.length}`)
  } else if (recipes.length === 0) {
    console.warn('[dashboard] Planning LLM called tool but produced 0 recipes')
  } else {
    const toolNames = recipes.flatMap((r) => r.dataSources.map((ds) => ds.toolName))
    console.log(`[dashboard] Planning produced ${recipes.length} insight widgets using tools: ${toolNames.join(', ')}`)
  }

  return recipes.sort((a, b) => b.score - a.score)
}

function resolveToolName(
  name: string,
  mcpTools: ServerTool[],
  toolNameSet: Set<string>,
): string | null {
  if (toolNameSet.has(name)) return name

  const suffixMatches = mcpTools.filter((t) => {
    const parts = t.name.split('__')
    return parts.length === 2 && parts[1] === name
  })
  if (suffixMatches.length === 1) {
    console.log(`[dashboard] Corrected tool name: "${name}" → "${suffixMatches[0].name}"`)
    return suffixMatches[0].name
  }

  const substringMatches = mcpTools.filter((t) =>
    t.name.toLowerCase().includes(name.toLowerCase()),
  )
  if (substringMatches.length === 1) {
    console.log(`[dashboard] Corrected tool name: "${name}" → "${substringMatches[0].name}"`)
    return substringMatches[0].name
  }

  const reverseMatches = mcpTools.filter((t) =>
    name.toLowerCase().includes(t.name.split('__')[1]?.toLowerCase() ?? ''),
  )
  if (reverseMatches.length === 1) {
    console.log(`[dashboard] Corrected tool name: "${name}" → "${reverseMatches[0].name}"`)
    return reverseMatches[0].name
  }

  return null
}

function validateRecipes(
  recipes: WidgetRecipe[],
  mcpTools: ServerTool[],
): WidgetRecipe[] {
  const toolNameSet = new Set(mcpTools.map((t) => t.name))
  const validated: WidgetRecipe[] = []

  for (const recipe of recipes) {
    const validSources: DataSource[] = []

    for (const source of recipe.dataSources) {
      const resolved = resolveToolName(source.toolName, mcpTools, toolNameSet)
      if (resolved) {
        validSources.push({ ...source, toolName: resolved })
      } else {
        console.warn(`[dashboard] Dropped source "${source.label}" from "${recipe.widgetId}": no matching tool for "${source.toolName}"`)
      }
    }

    if (validSources.length > 0) {
      validated.push({ ...recipe, dataSources: validSources })
    } else {
      console.warn(`[dashboard] Dropped recipe "${recipe.widgetId}": all data sources had invalid tool names`)
    }
  }

  return validated
}

const COMPANY_ID = '207676'
const COMPANY_ID_FIELDS = new Set([
  'companyid', 'company_id', 'clientid', 'client_id', 'companyId', 'clientId',
])

function isCompanyIdField(name: string): boolean {
  return COMPANY_ID_FIELDS.has(name) || COMPANY_ID_FIELDS.has(name.toLowerCase())
}

function ensureCompanyId(
  params: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!props) return params

  const result = { ...params }

  for (const [key, propSchema] of Object.entries(props)) {
    if (isCompanyIdField(key) && !(key in result)) {
      result[key] = COMPANY_ID
    } else if (propSchema.type === 'object' && propSchema.properties) {
      if (key in result && typeof result[key] === 'object' && result[key] !== null) {
        result[key] = ensureCompanyId(result[key] as Record<string, unknown>, propSchema)
      } else if (!(key in result)) {
        const required = new Set((schema.required as string[]) || [])
        if (required.has(key)) {
          result[key] = ensureCompanyId({}, propSchema)
        }
      }
    }
  }

  return result
}

function isEmptyResult(result: unknown): boolean {
  if (result == null) return true
  if (typeof result === 'string') {
    const trimmed = result.trim()
    if (!trimmed || trimmed === '[]' || trimmed === '{}' || trimmed === 'null') return true
    try {
      return isEmptyResult(JSON.parse(trimmed))
    } catch {
      return false
    }
  }
  if (Array.isArray(result)) return result.length === 0
  if (typeof result === 'object') {
    const values = Object.values(result as Record<string, unknown>)
    if (values.length === 0) return true
    if (values.length === 1 && Array.isArray(values[0]) && values[0].length === 0) return true
  }
  return false
}

const CATALOG_PROMPT = uiCatalog.prompt({
  mode: 'standalone',
  customRules: [
    'Generate exactly one visualization from the provided data.',
    'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
    'When using DataGrid, include ALL rows with pagination enabled.',
    'Choose the most appropriate chart type: bar charts for comparisons, line/area for trends, pie/donut for proportions.',
    'Always include a descriptive title.',
  ],
})

function toPersistedRecipes(recipes: WidgetRecipe[]): PersistedRecipe[] {
  return recipes.map((r) => ({
    widgetId: r.widgetId,
    title: r.title,
    insight: r.insight,
    dataSources: r.dataSources,
    render: r.render,
    score: r.score,
  }))
}

async function updateSnapshotWidgets(snapshotId: string, widgets: PersistedWidget[]) {
  await db
    .update(dashboardSnapshots)
    .set({ widgets })
    .where(eq(dashboardSnapshots.id, snapshotId))
}

async function renderWidget(
  recipe: WidgetRecipe,
  mcpTools: ServerTool[],
): Promise<PersistedWidget> {
  const results: Record<string, unknown> = {}

  for (const source of recipe.dataSources) {
    const tool = mcpTools.find((t) => t.name === source.toolName)
    if (!tool) {
      console.warn(`[dashboard] Tool not found for source "${source.label}": ${source.toolName}`)
      results[source.label] = null
      continue
    }

    const toolSchema = (tool.inputSchema as Record<string, unknown>) || {}
    const toolParams = ensureCompanyId(source.toolParams, toolSchema)

    try {
      const toolResult = await (tool.execute as (args: unknown) => Promise<unknown>)(toolParams)
      results[source.label] = isEmptyResult(toolResult) ? null : toolResult
    } catch (err) {
      console.warn(`[dashboard] Tool execution failed for "${source.label}" (${source.toolName}):`, err instanceof Error ? err.message : err)
      results[source.label] = null
    }
  }

  const hasAnyData = Object.values(results).some((v) => v !== null)
  if (!hasAnyData) {
    return {
      widgetId: recipe.widgetId,
      title: recipe.title,
      insight: recipe.insight,
      spec: null,
      skipReason: 'All data sources returned empty or failed',
    }
  }

  const adapter = getAzureAdapter()

  const dataSourceSections = Object.entries(results)
    .map(([label, data]) => {
      if (data === null) return `### ${label}\n(no data available)`
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      const truncated = dataStr.length > 30_000 ? dataStr.slice(0, 30_000) + '\n... (truncated)' : dataStr
      return `### ${label}\n${truncated}`
    })
    .join('\n\n')

  const uiPrompt = `You are a dashboard widget renderer for an ${recipe.title} widget.

## Insight Question
${recipe.insight}

## Data Sources
${dataSourceSections}

## Render Instructions
${recipe.render}

Analyze the data to answer the insight question. Generate exactly one visualization that highlights the most important findings.
Use charts (BarChart, PieChart, LineChart, AreaChart) for trends, comparisons, and distributions.
Use DataGrid only for actionable item lists that the user needs to act on.
If a data source is null, work with what's available — do not mention missing data unless it's critical.
IMPORTANT: Do NOT set the "title" prop on the chart/grid component — the title is displayed separately in the card header. Set title to null.
IMPORTANT: If the available data is insufficient to produce a meaningful visualization (e.g. all sources are null or the data is empty/trivial), output NOTHING — no spec block at all. Never generate placeholder or "No data available" visualizations.
Do not output any text outside the spec block.`

  const uiStream = chat({
    adapter,
    messages: [{ role: 'user' as const, content: uiPrompt }],
    systemPrompts: [CATALOG_PROMPT],
  })

  let spec: Spec | null = null
  for await (const chunk of withJsonRender(uiStream)) {
    if (chunk.type === 'CUSTOM' && chunk.name === 'spec_complete') {
      const value = chunk.value as { spec: Spec }
      spec = value.spec
    }
  }

  if (!spec || !spec.root || !spec.elements || Object.keys(spec.elements).length === 0) {
    return {
      widgetId: recipe.widgetId,
      title: recipe.title,
      insight: recipe.insight,
      spec: null,
      skipReason: 'UI generation produced no visualization',
    }
  }

  return {
    widgetId: recipe.widgetId,
    title: recipe.title,
    insight: recipe.insight,
    spec: spec as unknown as Record<string, unknown>,
  }
}

export interface GenerateDashboardParams {
  snapshotId: string
  persona: string
  previousWidgetIds: string[]
  previousWidgets?: PersistedWidget[]
}

export async function generateDashboard(params: GenerateDashboardParams): Promise<void> {
  const { snapshotId, persona, previousWidgetIds, previousWidgets = [] } = params

  const carryForward = previousWidgets.filter((w) => w.spec !== null)
  if (carryForward.length > 0) {
    await updateSnapshotWidgets(snapshotId, carryForward)
    console.log(`[dashboard] Seeded snapshot ${snapshotId} with ${carryForward.length} previous widgets`)
  }

  try {
    const mcpTools = await getAllMcpTools()
    console.log(`[dashboard] Loaded ${mcpTools.length} MCP tools for snapshot ${snapshotId}`)

    if (mcpTools.length === 0) {
      await db
        .update(dashboardSnapshots)
        .set({
          status: 'failed',
          error: 'No MCP tools loaded — check MCP server connections and auth',
          widgets: carryForward.length > 0 ? carryForward : undefined,
          completedAt: new Date(),
        })
        .where(eq(dashboardSnapshots.id, snapshotId))
      return
    }

    const rawRecipes = await runPlanningPhase(persona, mcpTools, previousWidgetIds)
    const recipes = validateRecipes(rawRecipes, mcpTools)

    console.log(`[dashboard] Planning: ${rawRecipes.length} raw → ${recipes.length} validated recipes`)

    await db
      .update(dashboardSnapshots)
      .set({ recipes: toPersistedRecipes(recipes) })
      .where(eq(dashboardSnapshots.id, snapshotId))

    if (recipes.length === 0) {
      await db
        .update(dashboardSnapshots)
        .set({
          status: carryForward.length > 0 ? 'complete' : 'failed',
          error: carryForward.length > 0 ? undefined : 'Planning phase produced no valid widget recipes',
          widgets: carryForward.length > 0 ? carryForward : undefined,
          completedAt: new Date(),
        })
        .where(eq(dashboardSnapshots.id, snapshotId))
      return
    }

    const widgets: PersistedWidget[] = [...carryForward]

    for (const recipe of recipes) {
      console.log(`[dashboard] Rendering widget "${recipe.widgetId}" for snapshot ${snapshotId}`)
      const widget = await renderWidget(recipe, mcpTools)
      widgets.push(widget)
      await updateSnapshotWidgets(snapshotId, widgets)
    }

    await db
      .update(dashboardSnapshots)
      .set({
        status: 'complete',
        widgets,
        completedAt: new Date(),
      })
      .where(eq(dashboardSnapshots.id, snapshotId))

    const newCount = widgets.length - carryForward.length
    const successCount = widgets.filter((w) => w.spec !== null).length
    console.log(`[dashboard] Snapshot ${snapshotId} complete: ${successCount} renderable widgets (${carryForward.length} carried forward, ${newCount} new)`)
  } catch (err) {
    console.error(`[dashboard] Fatal error generating snapshot ${snapshotId}:`, err)
    await db
      .update(dashboardSnapshots)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        widgets: carryForward.length > 0 ? carryForward : undefined,
        completedAt: new Date(),
      })
      .where(eq(dashboardSnapshots.id, snapshotId))
  }
}
