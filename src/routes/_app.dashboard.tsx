import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { JsonRenderDisplay } from '~/components/json-render-display'
import { VirtualGrid } from '~/components/virtual-grid'
import { Separator } from '~/components/ui/separator'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '~/components/ai-elements/chain-of-thought'
import { SidebarTrigger } from '~/components/ui/sidebar'
import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import type { Spec } from '@json-render/core'
import { uiCatalog } from '~/lib/ui-catalog'
import type { PersistedWidget, PersistedRecipe } from '~/db/schema'

const CATALOG_TYPES = new Set(uiCatalog.componentNames)

export const Route = createFileRoute('/_app/dashboard')({
  component: Dashboard,
})

const PERSONA = 'HR Admin'
const POLL_INTERVAL_MS = 3000

interface SnapshotResponse {
  snapshot: {
    id: string
    status: 'generating' | 'complete' | 'failed'
    persona: string
    recipes: PersistedRecipe[] | null
    widgets: PersistedWidget[] | null
    error: string | null
    createdAt: string
    completedAt: string | null
  } | null
  isStale: boolean
}

function Dashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotResponse['snapshot']>(null)
  const [isStale, setIsStale] = useState(true)
  const [isPolling, setIsPolling] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setIsPolling(false)
  }, [])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?persona=${encodeURIComponent(PERSONA)}`)
      if (!res.ok) return null
      const data = (await res.json()) as SnapshotResponse
      setSnapshot(data.snapshot)
      setIsStale(data.isStale)
      return data
    } catch {
      return null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    setIsPolling(true)
    pollRef.current = setInterval(async () => {
      const data = await fetchLatest()
      if (data?.snapshot?.status === 'complete' || data?.snapshot?.status === 'failed') {
        stopPolling()
      }
    }, POLL_INTERVAL_MS)
  }, [fetchLatest, stopPolling])

  const triggerGeneration = useCallback(
    async (force = false) => {
      setIsTriggering(true)
      try {
        const res = await fetch(`/api/dashboard${force ? '?force=true' : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona: PERSONA }),
        })
        if (res.ok) {
          await fetchLatest()
          startPolling()
        }
      } finally {
        setIsTriggering(false)
      }
    },
    [fetchLatest, startPolling],
  )

  useEffect(() => {
    let cancelled = false

    async function init() {
      const data = await fetchLatest()
      if (cancelled) return
      setInitialLoaded(true)

      if (!data?.snapshot || data.isStale) {
        if (data?.snapshot?.status === 'generating') {
          startPolling()
        } else {
          await triggerGeneration()
        }
      } else if (data.snapshot.status === 'generating') {
        startPolling()
      }
    }

    init()
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [fetchLatest, startPolling, stopPolling, triggerGeneration])

  const handleRegenerate = useCallback(() => {
    stopPolling()
    triggerGeneration(true)
  }, [stopPolling, triggerGeneration])

  const isGenerating = snapshot?.status === 'generating' || isTriggering
  const widgets = snapshot?.widgets ?? []
  const recipes = snapshot?.recipes ?? []

  const renderableWidgets = widgets.filter(
    (w): w is PersistedWidget & { spec: Record<string, unknown> } =>
      w.spec !== null && isRenderableSpec(w.spec as unknown as Spec),
  )

  return (
    <>
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background p-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <div className="flex flex-1 items-center gap-3">
            <h1 className="text-sm font-medium">Dashboard</h1>
            <Badge variant="secondary">{PERSONA}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <SpinnerIcon className="size-4" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Regenerate
          </Button>
        </header>

        <div className="flex flex-col gap-6 p-6">
          {initialLoaded && (isGenerating || recipes.length > 0) && (
            <GenerationProgress
              recipes={recipes}
              widgets={widgets}
              isGenerating={isGenerating}
              error={snapshot?.status === 'failed' ? snapshot.error : null}
            />
          )}

          {renderableWidgets.length > 0 ? (
            <VirtualGrid
              items={renderableWidgets}
              getKey={(w) => w.widgetId}
              estimateSize={500}
              gap={20}
              overscan={6}
              lanes={(w) => (w >= 1024 ? 2 : 1)}
              renderItem={(widget) => (
                <Card className="flex h-full flex-col animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                  <CardHeader>
                    <CardTitle>{widget.title}</CardTitle>
                    <CardDescription>{widget.insight}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex h-[340px] min-h-0 flex-col overflow-hidden">
                    <JsonRenderDisplay
                      spec={widget.spec as unknown as Spec}
                      isStreaming={false}
                      fill
                    />
                  </CardContent>
                </Card>
              )}
            />
          ) : (
            isGenerating && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonCard key={`skeleton-${i}`} />
                ))}
              </div>
            )
          )}

          {initialLoaded &&
            !isGenerating &&
            renderableWidgets.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                {snapshot?.status === 'failed' ? (
                  <>
                    <AlertCircleIcon className="size-12 text-muted-foreground" />
                    <div className="max-w-md space-y-2">
                      <h2 className="text-lg font-medium">
                        Generation failed
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {snapshot.error ||
                          'An error occurred while generating the dashboard. Try regenerating.'}
                      </p>
                    </div>
                  </>
                ) : !initialLoaded ? (
                  <>
                    <SparklesIcon className="size-12 text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-medium">Loading dashboard</h2>
                      <p className="text-sm text-muted-foreground">
                        Checking for existing dashboard data...
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircleIcon className="size-12 text-muted-foreground" />
                    <div className="max-w-md space-y-2">
                      <h2 className="text-lg font-medium">No data available</h2>
                      <p className="text-sm text-muted-foreground">
                        All data sources returned empty results or errors. Try
                        regenerating the dashboard.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
    </>
  )
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[200px] w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

function isRenderableSpec(spec: Spec | undefined | null): spec is Spec {
  if (!spec?.root || !spec?.elements) return false
  if (Object.keys(spec.elements).length === 0) return false
  const rootElement = spec.elements[spec.root]
  if (!rootElement) return false
  return CATALOG_TYPES.has(rootElement.type)
}

function SpinnerIcon({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  return <Loader2Icon className={cn('animate-spin', className)} {...props} />
}

function formatWidgetName(widgetId: string): string {
  return widgetId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function GenerationProgress({
  recipes,
  widgets,
  isGenerating,
  error,
}: {
  recipes: PersistedRecipe[]
  widgets: PersistedWidget[]
  isGenerating: boolean
  error: string | null | undefined
}) {
  const [manualOpen, setManualOpen] = useState<boolean | undefined>(undefined)

  const completedCount = widgets.filter((w) => w.spec !== null).length
  const skippedCount = widgets.filter(
    (w) => w.spec === null && w.skipReason,
  ).length
  const processedCount = completedCount + skippedCount
  const totalCount = recipes.length

  const prevGeneratingRef = useRef(isGenerating)
  useEffect(() => {
    if (prevGeneratingRef.current && !isGenerating) {
      setManualOpen(false)
    }
    prevGeneratingRef.current = isGenerating
  }, [isGenerating])

  const isOpen = manualOpen ?? isGenerating

  const headerText = isGenerating
    ? totalCount > 0
      ? `Processing widgets (${processedCount}/${totalCount})...`
      : 'Planning dashboard...'
    : error
      ? 'Dashboard generation failed'
      : completedCount > 0
        ? `Dashboard generated (${completedCount} widget${completedCount !== 1 ? 's' : ''})`
        : 'Dashboard complete'

  return (
    <ChainOfThought open={isOpen} onOpenChange={setManualOpen}>
      <ChainOfThoughtHeader>{headerText}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {isGenerating && recipes.length === 0 && (
          <ChainOfThoughtStep
            icon={SpinnerIcon}
            label="Identifying key insights for persona..."
            status="active"
          />
        )}

        {recipes.length > 0 && (
          <ChainOfThoughtStep
            icon={SparklesIcon}
            label={`Planned ${totalCount} insight widgets`}
            status="complete"
          >
            <div className="flex flex-wrap gap-1.5">
              {recipes.map((r) => (
                <Badge key={r.widgetId} variant="outline" className="text-xs">
                  {r.title || formatWidgetName(r.widgetId)}
                </Badge>
              ))}
            </div>
          </ChainOfThoughtStep>
        )}

        {recipes.map((recipe) => {
          const widget = widgets.find((w) => w.widgetId === recipe.widgetId)
          if (!widget) {
            if (isGenerating && widgets.length > 0) {
              const isNext =
                recipes.indexOf(recipe) === widgets.length
              if (isNext) {
                return (
                  <ChainOfThoughtStep
                    key={recipe.widgetId}
                    icon={SpinnerIcon}
                    label={`Processing ${recipe.title || formatWidgetName(recipe.widgetId)}...`}
                    status="active"
                  />
                )
              }
            }
            return null
          }

          const displayName = widget.title || formatWidgetName(widget.widgetId)

          if (widget.spec !== null) {
            return (
              <ChainOfThoughtStep
                key={recipe.widgetId}
                icon={CheckIcon}
                label={displayName}
                status="complete"
              />
            )
          }

          return (
            <ChainOfThoughtStep
              key={recipe.widgetId}
              icon={AlertCircleIcon}
              label={
                <span>
                  {displayName}
                  <span className="text-muted-foreground">
                    {' '}
                    — {widget.skipReason}
                  </span>
                </span>
              }
              status="complete"
            />
          )
        })}

        {error && (
          <ChainOfThoughtStep
            icon={AlertCircleIcon}
            label={
              <span className="text-destructive">
                Error: {error}
              </span>
            }
            status="complete"
          />
        )}

        {!isGenerating && !error && processedCount === totalCount && totalCount > 0 && (
          <ChainOfThoughtStep
            icon={CheckIcon}
            label="Done"
            status="complete"
          />
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
