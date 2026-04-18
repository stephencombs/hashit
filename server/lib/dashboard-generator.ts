import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { validateSpec as validateSpecStructure } from '@json-render/core'
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

const PREFERRED_ROW_KEYS = ['data', 'items', 'rows', 'results', 'records', 'list', 'entries']

function extractRows(result: unknown, depth = 0): unknown[] | null {
  if (depth > 3 || result == null) return null
  if (Array.isArray(result)) return result.length > 0 ? result : null
  if (typeof result === 'string') {
    const trimmed = result.trim()
    if (!trimmed) return null
    try {
      return extractRows(JSON.parse(trimmed), depth)
    } catch {
      return null
    }
  }
  if (typeof result !== 'object') return null
  const obj = result as Record<string, unknown>
  for (const key of PREFERRED_ROW_KEYS) {
    const val = obj[key]
    if (Array.isArray(val) && val.length > 0) return val
  }
  const arrayEntries = Object.entries(obj).filter(
    ([, v]) => Array.isArray(v) && (v as unknown[]).length > 0,
  )
  if (arrayEntries.length === 1) return arrayEntries[0][1] as unknown[]
  const objectEntries = Object.entries(obj).filter(
    ([, v]) => v != null && typeof v === 'object' && !Array.isArray(v),
  )
  if (objectEntries.length === 1) return extractRows(objectEntries[0][1], depth + 1)
  return null
}

const SERIES_KEY_PROPS = ['yKeys', 'dataKeys'] as const

type ValidationOutcome = { valid: true } | { valid: false; reason: string }

function validateWidgetSpec(spec: Spec | null): ValidationOutcome {
  if (!spec || !spec.root || !spec.elements) {
    return { valid: false, reason: 'Spec missing root or elements' }
  }
  const errors = validateSpecStructure(spec).issues.filter(
    (i) => i.severity === 'error',
  )
  if (errors.length > 0) {
    return {
      valid: false,
      reason: `Structural: ${errors.map((e) => e.message).join('; ')}`,
    }
  }
  const parsed = uiCatalog.validate(spec)
  if (!parsed.success) {
    const first = parsed.error?.issues?.[0]
    const detail = first
      ? `${first.path.join('.')}: ${first.message}`
      : parsed.error?.message ?? 'unknown zod error'
    return { valid: false, reason: `Props/catalog: ${detail.slice(0, 240)}` }
  }
  for (const [key, element] of Object.entries(spec.elements)) {
    const props = (element.props ?? {}) as Record<string, unknown>
    if (Array.isArray(props.data) && props.data.length === 0) {
      return { valid: false, reason: `${element.type} "${key}" has empty data array` }
    }
    for (const seriesKey of SERIES_KEY_PROPS) {
      const val = props[seriesKey]
      if (Array.isArray(val) && val.length === 0) {
        return { valid: false, reason: `${element.type} "${key}" has empty ${seriesKey}` }
      }
    }
  }
  return { valid: true }
}

const CATALOG_PROMPT = uiCatalog.prompt({
  mode: 'standalone',
  customRules: [
    'Generate exactly one visualization from the provided data.',
    'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
    'When using DataGrid, include ALL rows with pagination enabled.',
    'Choose the most appropriate chart type: bar charts for comparisons, line/area for trends, pie/donut for proportions.',
    'Set the "title" prop to null - the widget title is rendered separately by the host.',
    'The "data" prop MUST be a non-empty array of row objects copied from the provided data. Never set data to [] or invent placeholder rows.',
    'For charts, xKey/nameKey/axisKey and yKeys/dataKeys/valueKey MUST reference fields that actually exist on the row objects, and yKeys/dataKeys must be non-empty.',
  ],
})

const MAX_DATA_CHARS = 30_000

function formatDataSources(
  sources: Record<string, { rows: unknown[] | null; raw: unknown }>,
): string {
  return Object.entries(sources)
    .map(([label, { rows, raw }]) => {
      if (raw == null) return `### ${label}\n(no data available)`
      if (rows && rows.length > 0) {
        const rowsStr = JSON.stringify(rows, null, 2)
        const truncated =
          rowsStr.length > MAX_DATA_CHARS
            ? rowsStr.slice(0, MAX_DATA_CHARS) + '\n... (truncated)'
            : rowsStr
        const sample = rows[0]
        const fields =
          sample && typeof sample === 'object' && !Array.isArray(sample)
            ? Object.keys(sample as Record<string, unknown>)
            : []
        const fieldsLine =
          fields.length > 0 ? `\nAvailable fields: ${fields.join(', ')}` : ''
        return `### ${label} (${rows.length} row${rows.length === 1 ? '' : 's'}, pre-extracted as an array)${fieldsLine}\n${truncated}`
      }
      const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      const truncated =
        rawStr.length > MAX_DATA_CHARS
          ? rawStr.slice(0, MAX_DATA_CHARS) + '\n... (truncated)'
          : rawStr
      return `### ${label} (non-tabular; original shape)\n${truncated}`
    })
    .join('\n\n')
}

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
  /** Set by uniqueness pass for observability */
  uniquenessScore?: number
  uniquenessReasons?: string[]
}

/** Business vs uniqueness blend for ordering (configurable). */
const RANK_WEIGHT_SCORE = 0.6
const RANK_WEIGHT_UNIQUENESS = 0.4

/** Components of uniquenessScore (0–100 each → weighted sum). */
const UNIQ_WEIGHT_ID = 0.4
const UNIQ_WEIGHT_INSIGHT = 0.35
const UNIQ_WEIGHT_SOURCE = 0.25

const TARGET_RECIPE_COUNT = 6

const INSIGHT_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'how', 'what',
  'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
  'with', 'about', 'into', 'through', 'during', 'before', 'after', 'from',
  'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once',
  'here', 'there', 'all', 'each', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'are', 'my', 'our', 'your', 'their', 'its',
])

function normalizeInsightText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function insightTokenSet(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of normalizeInsightText(s).split(/\s+/)) {
    if (w.length > 1 && !INSIGHT_STOPWORDS.has(w)) out.add(w)
  }
  return out
}

/** Token Jaccard similarity in [0, 1]. */
function insightSimilarity(a: string, b: string): number {
  const A = insightTokenSet(a)
  const B = insightTokenSet(b)
  if (A.size === 0 && B.size === 0) return 1
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) {
    if (B.has(t)) inter++
  }
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

function maxInsightSimilarityTo(insight: string, others: string[]): number {
  let m = 0
  for (const o of others) {
    const sim = insightSimilarity(insight, o)
    if (sim > m) m = sim
  }
  return m
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** Primary tool family: segment before `__`, else full name. */
function getToolFamily(toolName: string): string {
  const idx = toolName.indexOf('__')
  return idx === -1 ? toolName : toolName.slice(0, idx)
}

function dataSourceSignature(ds: DataSource): string {
  return `${getToolFamily(ds.toolName)}|${stableStringify(ds.toolParams)}`
}

function recipeFamilySet(recipe: WidgetRecipe): Set<string> {
  return new Set(recipe.dataSources.map((ds) => getToolFamily(ds.toolName)))
}

function computeUniquenessScore(
  recipe: WidgetRecipe,
  previousWidgetIdSet: Set<string>,
  previousInsightTexts: string[],
  selectedInsights: string[],
  selectedSignatures: Set<string>,
): { score: number; reasons: string[] } {
  const reasons: string[] = []

  const idOk = !previousWidgetIdSet.has(recipe.widgetId.trim().toLowerCase())
  const idScore = idOk ? 100 : 0
  if (!idOk) reasons.push('id:reused_historical_widget_id')

  const pool = [...previousInsightTexts, ...selectedInsights]
  const maxSim = maxInsightSimilarityTo(recipe.insight, pool)
  const insightScore = Math.round(100 * (1 - Math.min(1, maxSim)))
  reasons.push(`insight:maxSim=${maxSim.toFixed(3)}→${insightScore}`)

  const sigs = [...new Set(recipe.dataSources.map(dataSourceSignature))]
  let overlap = 0
  for (const s of sigs) {
    if (selectedSignatures.has(s)) overlap++
  }
  const overlapRatio = sigs.length === 0 ? 0 : overlap / sigs.length
  const sourceScore = Math.round(100 * (1 - overlapRatio))
  reasons.push(`source:sigOverlap=${overlapRatio.toFixed(3)}→${sourceScore}`)

  const uniquenessScore = Math.round(
    UNIQ_WEIGHT_ID * idScore +
      UNIQ_WEIGHT_INSIGHT * insightScore +
      UNIQ_WEIGHT_SOURCE * sourceScore,
  )
  return { score: uniquenessScore, reasons }
}

function combinedRank(score: number, uniquenessScore: number): number {
  return RANK_WEIGHT_SCORE * score + RANK_WEIGHT_UNIQUENESS * uniquenessScore
}

type RelaxationLevel = { insightThreshold: number; maxPerFamily: number }

const RELAXATION_LEVELS: RelaxationLevel[] = [
  { insightThreshold: 0.82, maxPerFamily: 2 },
  { insightThreshold: 0.88, maxPerFamily: 3 },
  { insightThreshold: 0.92, maxPerFamily: 4 },
  { insightThreshold: 0.96, maxPerFamily: 6 },
  { insightThreshold: 1.0, maxPerFamily: 99 },
]

type GateStats = {
  duplicateInBatch: number
  duplicateHistoricalId: number
  insightSimilarity: number
  familyCap: number
}

function dedupeRecipesByWidgetId(recipes: WidgetRecipe[]): WidgetRecipe[] {
  const map = new Map<string, WidgetRecipe>()
  for (const r of recipes) {
    const key = r.widgetId.trim().toLowerCase()
    const prev = map.get(key)
    if (!prev || r.score > prev.score) map.set(key, r)
  }
  return [...map.values()].sort((a, b) => b.score - a.score)
}

/**
 * Deterministic selection: hard gates (ids, optional similarity/family), combined
 * ranking, relaxation ladder until up to TARGET_RECIPE_COUNT recipes or exhausted.
 */
function selectUniqueRecipes(
  recipes: WidgetRecipe[],
  previousWidgetIds: string[],
  previousWidgets: PersistedWidget[],
): WidgetRecipe[] {
  const previousIdSet = new Set(
    previousWidgetIds.map((id) => id.trim().toLowerCase()),
  )
  const previousInsightTexts = previousWidgets
    .map((w) => w.insight)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)

  const deduped = dedupeRecipesByWidgetId(recipes)

  let bestResult: WidgetRecipe[] = []
  let bestLevel = -1
  let bestStats: GateStats | null = null
  let bestPool = 0
  let bestAvgUniq = 0

  for (let levelIdx = 0; levelIdx < RELAXATION_LEVELS.length; levelIdx++) {
    const level = RELAXATION_LEVELS[levelIdx]!
    const stats: GateStats = {
      duplicateInBatch: 0,
      duplicateHistoricalId: 0,
      insightSimilarity: 0,
      familyCap: 0,
    }

    const pool = deduped.filter((r) => {
      const key = r.widgetId.trim().toLowerCase()
      if (previousIdSet.has(key)) {
        stats.duplicateHistoricalId++
        return false
      }
      return true
    })

    const ranked = [...pool].sort((a, b) => {
      const ua = computeUniquenessScore(
        a,
        previousIdSet,
        previousInsightTexts,
        [],
        new Set(),
      ).score
      const ub = computeUniquenessScore(
        b,
        previousIdSet,
        previousInsightTexts,
        [],
        new Set(),
      ).score
      const ra = combinedRank(a.score, ua)
      const rb = combinedRank(b.score, ub)
      if (rb !== ra) return rb - ra
      return b.score - a.score
    })

    const selected: WidgetRecipe[] = []
    const selectedInsights: string[] = []
    const selectedSignatures = new Set<string>()
    const familyRecipeCount = new Map<string, number>()
    const seenInSelection = new Set<string>()

    for (const recipe of ranked) {
      if (selected.length >= TARGET_RECIPE_COUNT) break

      const wid = recipe.widgetId.trim().toLowerCase()
      if (seenInSelection.has(wid)) {
        stats.duplicateInBatch++
        continue
      }

      const maxSim = maxInsightSimilarityTo(recipe.insight, [
        ...previousInsightTexts,
        ...selectedInsights,
      ])
      if (maxSim > level.insightThreshold) {
        stats.insightSimilarity++
        continue
      }

      const families = recipeFamilySet(recipe)
      let blockedByFamily = false
      for (const fam of families) {
        const n = familyRecipeCount.get(fam) ?? 0
        if (n + 1 > level.maxPerFamily) {
          blockedByFamily = true
          break
        }
      }
      if (blockedByFamily) {
        stats.familyCap++
        continue
      }

      const { score: uniquenessScore, reasons } = computeUniquenessScore(
        recipe,
        previousIdSet,
        previousInsightTexts,
        selectedInsights,
        selectedSignatures,
      )

      seenInSelection.add(wid)
      selectedInsights.push(recipe.insight)
      for (const ds of recipe.dataSources) {
        selectedSignatures.add(dataSourceSignature(ds))
      }
      for (const fam of families) {
        familyRecipeCount.set(fam, (familyRecipeCount.get(fam) ?? 0) + 1)
      }

      selected.push({
        ...recipe,
        uniquenessScore,
        uniquenessReasons: reasons,
      })
    }

    const avgUniq =
      selected.length === 0
        ? 0
        : selected.reduce((s, r) => s + (r.uniquenessScore ?? 0), 0) /
          selected.length

    if (selected.length > bestResult.length) {
      bestResult = selected
      bestLevel = levelIdx
      bestStats = stats
      bestPool = pool.length
      bestAvgUniq = avgUniq
    }

    if (selected.length >= TARGET_RECIPE_COUNT) {
      console.log(
        `[dashboard][uniqueness] level=${levelIdx} threshold=${level.insightThreshold} maxFamily=${level.maxPerFamily} ` +
          `planned=${recipes.length} deduped=${deduped.length} pool=${pool.length} ` +
          `accepted=${selected.length} avgUniq=${avgUniq.toFixed(1)} target_met=1 ` +
          `rej_histId=${stats.duplicateHistoricalId} rej_batchDup=${stats.duplicateInBatch} ` +
          `rej_insight=${stats.insightSimilarity} rej_family=${stats.familyCap}`,
      )
      return selected
    }
  }

  const lvl = bestLevel >= 0 ? RELAXATION_LEVELS[bestLevel]! : null
  const st = bestStats
  console.log(
    `[dashboard][uniqueness] level=${bestLevel} threshold=${lvl?.insightThreshold ?? 'n/a'} maxFamily=${lvl?.maxPerFamily ?? 'n/a'} ` +
      `planned=${recipes.length} deduped=${deduped.length} pool=${bestPool} ` +
      `accepted=${bestResult.length} avgUniq=${bestAvgUniq.toFixed(1)} target_met=0 ` +
      `rej_histId=${st?.duplicateHistoricalId ?? 0} rej_batchDup=${st?.duplicateInBatch ?? 0} ` +
      `rej_insight=${st?.insightSimilarity ?? 0} rej_family=${st?.familyCap ?? 0}`,
  )
  return bestResult
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

function toPersistedRecipes(recipes: WidgetRecipe[]): PersistedRecipe[] {
  return recipes.map((r) => {
    const base: PersistedRecipe = {
      widgetId: r.widgetId,
      title: r.title,
      insight: r.insight,
      dataSources: r.dataSources,
      render: r.render,
      score: r.score,
    }
    if (r.uniquenessScore !== undefined) base.uniquenessScore = r.uniquenessScore
    if (r.uniquenessReasons !== undefined) base.uniquenessReasons = r.uniquenessReasons
    return base
  })
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

  const normalized: Record<string, { rows: unknown[] | null; raw: unknown }> = {}
  for (const [label, raw] of Object.entries(results)) {
    normalized[label] = { rows: extractRows(raw), raw }
  }

  const hasAnyRows = Object.values(normalized).some((v) => v.rows && v.rows.length > 0)
  if (!hasAnyRows) {
    return {
      widgetId: recipe.widgetId,
      title: recipe.title,
      insight: recipe.insight,
      spec: null,
      skipReason: 'All data sources returned empty or failed',
    }
  }

  const uiPrompt = `You are a dashboard widget renderer for "${recipe.title}".

## Insight Question
${recipe.insight}

## Data Sources
Each labelled section is either (a) a pre-extracted array of row objects you can copy directly into the component's "data" prop, or (b) a non-tabular payload you must summarize into rows yourself before using.

${formatDataSources(normalized)}

## Render Instructions
${recipe.render}

## Rules
- Generate exactly one visualization that answers the insight question.
- Use charts (BarChart, PieChart, LineChart, AreaChart) for trends, comparisons, and distributions; use DataGrid for actionable item lists.
- The "data" prop MUST be a non-empty array of row objects. Prefer copying rows verbatim from the pre-extracted data; otherwise build rows by aggregating/grouping the raw payload.
- xKey/nameKey/axisKey and yKeys/dataKeys/valueKey MUST reference fields that actually exist on the row objects you pass in "data". yKeys and dataKeys MUST be non-empty.
- Set the "title" prop to null - the widget title is displayed separately by the host.
- If the available data is insufficient to produce a meaningful visualization, output NOTHING - no spec block at all.
- Do not output any text outside the spec block.`

  const adapter = getAzureAdapter()
  const uiStream = chat({
    adapter,
    messages: [{ role: 'user' as const, content: uiPrompt }],
    systemPrompts: [CATALOG_PROMPT],
  })

  let spec: Spec | null = null
  for await (const chunk of withJsonRender(uiStream)) {
    if (chunk.type === 'CUSTOM' && chunk.name === 'spec_complete') {
      spec = (chunk.value as { spec: Spec }).spec
    }
  }

  const validation = validateWidgetSpec(spec)
  if (!spec || !validation.valid) {
    const reason = validation.valid
      ? 'UI generation produced no visualization'
      : (validation as { valid: false; reason: string }).reason
    console.warn(`[dashboard] Dropping spec for "${recipe.widgetId}": ${reason}`)
    return {
      widgetId: recipe.widgetId,
      title: recipe.title,
      insight: recipe.insight,
      spec: null,
      skipReason: reason,
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
    const validated = validateRecipes(rawRecipes, mcpTools)
    const recipes = selectUniqueRecipes(validated, previousWidgetIds, previousWidgets)

    console.log(
      `[dashboard] Planning: ${rawRecipes.length} raw → ${validated.length} validated → ${recipes.length} unique recipes`,
    )

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

    const widgetsInOrder: Array<PersistedWidget | null> = Array(recipes.length).fill(null)
    let writeQueue: Promise<void> = Promise.resolve()

    function flushSnapshot() {
      const current = [
        ...widgetsInOrder.filter((w): w is PersistedWidget => w !== null),
        ...carryForward,
      ]
      writeQueue = writeQueue
        .then(() => updateSnapshotWidgets(snapshotId, current))
        .catch((err) => {
          console.warn(`[dashboard] Snapshot flush failed for ${snapshotId}:`, err)
        })
    }

    await Promise.all(
      recipes.map(async (recipe, i) => {
        console.log(`[dashboard] Rendering widget "${recipe.widgetId}" for snapshot ${snapshotId}`)
        try {
          widgetsInOrder[i] = await renderWidget(recipe, mcpTools)
        } catch (err) {
          console.error(`[dashboard] renderWidget failed for "${recipe.widgetId}":`, err)
          widgetsInOrder[i] = {
            widgetId: recipe.widgetId,
            title: recipe.title,
            insight: recipe.insight,
            spec: null,
            skipReason: `Render error — ${err instanceof Error ? err.message : String(err)}`,
          }
        }
        flushSnapshot()
      }),
    )

    await writeQueue

    const widgets: PersistedWidget[] = [
      ...widgetsInOrder.filter((w): w is PersistedWidget => w !== null),
      ...carryForward,
    ]

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
