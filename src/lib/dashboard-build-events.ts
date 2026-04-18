import { useMemo } from 'react'
import type { PersistedRecipe, PersistedWidget } from '~/db/schema'
import {
  formatSnapshotCompletedAt,
  getRecipeStatus,
  recipeDisplayTitle,
  type GenerationProgressMetrics,
} from '~/components/dashboard/generation-progress-views'

export type BuildEventTone = 'accent' | 'ok' | 'warn' | 'err' | 'muted'

export type BuildEventKind =
  | 'planning'
  | 'planned'
  | 'active'
  | 'done'
  | 'skipped'
  | 'error'
  | 'finished'

export type BuildEvent = {
  id: string
  text: string
  detail?: string
  tone: BuildEventTone
  kind: BuildEventKind
  recipe?: PersistedRecipe
  widget?: PersistedWidget
  time?: string
}

type UseBuildEventsInput = {
  recipes: PersistedRecipe[]
  widgets: PersistedWidget[]
  isGenerating: boolean
  error: string | null | undefined
  metrics: GenerationProgressMetrics
  snapshotCreatedAt: string | null
  snapshotCompletedAt: string | null
}

export function useBuildEvents({
  recipes,
  widgets,
  isGenerating,
  error,
  metrics,
  snapshotCreatedAt,
  snapshotCompletedAt,
}: UseBuildEventsInput): BuildEvent[] {
  return useMemo(() => {
    const out: BuildEvent[] = []
    if (isGenerating && recipes.length === 0) {
      out.push({
        id: 'planning',
        text: 'Planning dashboard insights…',
        tone: 'accent',
        kind: 'planning',
        time: formatSnapshotCompletedAt(snapshotCreatedAt) ?? undefined,
      })
    }
    if (recipes.length > 0) {
      out.push({
        id: 'planned',
        text: `Planned ${recipes.length} widget${recipes.length !== 1 ? 's' : ''}`,
        tone: 'accent',
        kind: 'planned',
        time: formatSnapshotCompletedAt(snapshotCreatedAt) ?? undefined,
      })
    }

    for (const recipe of recipes) {
      const widget = metrics.widgetsById.get(recipe.widgetId)
      const status = getRecipeStatus(
        recipe,
        widget,
        widgets.length,
        metrics.recipeIndexById,
        isGenerating,
      )
      if (status === 'done') {
        out.push({
          id: `done:${recipe.widgetId}`,
          text: `Rendered ${recipeDisplayTitle(recipe)}`,
          tone: 'ok',
          kind: 'done',
          recipe,
          widget,
        })
      } else if (status === 'skipped' && widget?.skipReason) {
        out.push({
          id: `skip:${recipe.widgetId}`,
          text: `Skipped ${recipeDisplayTitle(recipe)}`,
          detail: widget.skipReason,
          tone: 'warn',
          kind: 'skipped',
          recipe,
          widget,
        })
      } else if (status === 'active') {
        out.push({
          id: `active:${recipe.widgetId}`,
          text: `Rendering ${recipeDisplayTitle(recipe)}…`,
          tone: 'accent',
          kind: 'active',
          recipe,
        })
      }
    }

    if (error) {
      out.push({
        id: 'error',
        text: `Error: ${error}`,
        tone: 'err',
        kind: 'error',
      })
    }

    if (
      !isGenerating &&
      !error &&
      metrics.totalCount > 0 &&
      metrics.processedCount === metrics.totalCount
    ) {
      out.push({
        id: 'finished',
        text: `Finished · ${metrics.completedCount} rendered, ${metrics.skippedCount} skipped`,
        tone: 'ok',
        kind: 'finished',
        time: formatSnapshotCompletedAt(snapshotCompletedAt) ?? undefined,
      })
    }

    return out
  }, [
    recipes,
    widgets,
    isGenerating,
    error,
    metrics,
    snapshotCreatedAt,
    snapshotCompletedAt,
  ])
}
