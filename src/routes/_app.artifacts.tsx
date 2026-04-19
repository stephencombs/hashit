import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3Icon,
  ExternalLinkIcon,
  GridIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  TableIcon,
  Trash2Icon,
} from 'lucide-react'
import { Separator } from '~/components/ui/separator'
import { SidebarTrigger } from '~/components/ui/sidebar'
import { JsonRenderDisplay } from '~/components/json-render-display'
import { VirtualGrid } from '~/components/virtual-grid'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type { Spec } from '@json-render/core'
import {
  artifactsListQuery,
  type ArtifactListItem,
} from '~/lib/artifact-queries'

type ArtifactType = 'chart' | 'grid' | 'other'

function getArtifactType(spec: Record<string, unknown>): ArtifactType {
  const elements = spec.elements as
    | Record<string, { type?: string }>
    | undefined
  const root = spec.root as string | undefined
  if (!elements || !root) return 'other'
  const comp = elements[root]?.type
  if (comp === 'DataGrid') return 'grid'
  if (comp && comp.endsWith('Chart')) return 'chart'
  return 'other'
}

function typeLabel(type: ArtifactType) {
  if (type === 'chart') return 'Chart'
  if (type === 'grid') return 'Data Grid'
  return 'Visualization'
}

function TypeIcon({ type, className }: { type: ArtifactType; className?: string }) {
  if (type === 'grid') return <TableIcon className={className} />
  return <BarChart3Icon className={className} />
}

export const Route = createFileRoute('/_app/artifacts')({
  loader: ({ context }) => {
    if (import.meta.env.SSR) return
    return context.queryClient.ensureQueryData(artifactsListQuery)
  },
  component: ArtifactsPage,
})

function ArtifactListRow({
  artifact,
  onSelect,
  onDelete,
}: {
  artifact: ArtifactListItem
  onSelect: () => void
  onDelete: () => void
}) {
  const artType = getArtifactType(artifact.spec)
  return (
    <div
      className="group relative flex cursor-pointer items-center gap-4 border-b px-4 py-3 transition-colors hover:bg-accent/30 last:border-b-0"
      onClick={onSelect}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <TypeIcon type={artType} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{artifact.title}</h3>
        <p className="text-xs text-muted-foreground">{typeLabel(artType)}</p>
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {new Date(artifact.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {artifact.threadId && artifact.messageId && (
          <Link
            to="/chat/$threadId"
            params={{ threadId: artifact.threadId }}
            hash={`msg-${artifact.messageId}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Open in chat"
          >
            <ExternalLinkIcon className="size-4" />
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label={`Delete ${artifact.title}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

const CARD_HEIGHT = 360
const CARD_FOOTER_HEIGHT = 52

function ArtifactGalleryCard({
  artifact,
  onSelect,
}: {
  artifact: ArtifactListItem
  onSelect: () => void
}) {
  const artType = getArtifactType(artifact.spec)
  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-xl border bg-card overflow-hidden transition-colors hover:bg-accent/30"
      style={{ height: CARD_HEIGHT }}
      onClick={onSelect}
    >
      <div
        className="pointer-events-none flex min-h-0 flex-col overflow-hidden p-4"
        style={{ height: CARD_HEIGHT - CARD_FOOTER_HEIGHT }}
      >
        <JsonRenderDisplay
          spec={artifact.spec as unknown as Spec}
          isStreaming={false}
          fill
        />
      </div>
      <div
        className="flex shrink-0 items-center gap-3 border-t px-4"
        style={{ height: CARD_FOOTER_HEIGHT }}
      >
        <Badge variant="outline" className="shrink-0">
          <TypeIcon type={artType} className="size-3" />
          {typeLabel(artType)}
        </Badge>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{artifact.title}</h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {new Date(artifact.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}

type ViewMode = 'gallery' | 'list'

function ArtifactsSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-1.5 h-4 w-48" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-44 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
        </div>

        {/* Featured card */}
        <Skeleton className="h-[340px] w-full rounded-xl" />

        {/* Grid cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Skeleton className="h-[360px] rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function ArtifactsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'chart' | 'grid'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [selected, setSelected] = useState<ArtifactListItem | null>(null)

  const { data: artifacts = [], isPending } = useQuery(artifactsListQuery)

  const deleteArtifact = useMutation({
    mutationFn: async (artifactId: string) => {
      await fetch(`/api/artifacts/${artifactId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsListQuery.queryKey })
      setSelected(null)
    },
  })

  const filtered = useMemo(() => {
    return artifacts.filter((a) => {
      if (search && !a.title.toLowerCase().includes(search.toLowerCase()))
        return false
      if (typeFilter === 'all') return true
      return getArtifactType(a.spec) === typeFilter
    })
  }, [artifacts, search, typeFilter])

  const featured = filtered[0] ?? null
  const rest = filtered.slice(1)

  return (
    <>
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <h1 className="text-sm font-medium">Artifacts</h1>
        </header>

        {isPending ? <ArtifactsSkeleton /> : <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-balance">
                  Gallery
                </h2>
                <p className="text-sm text-pretty text-muted-foreground">
                  {filtered.length === artifacts.length
                    ? `${artifacts.length} saved artifact${artifacts.length === 1 ? '' : 's'}`
                    : `${filtered.length} of ${artifacts.length} artifacts`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search artifacts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-56 pl-9"
                  />
                </div>
                <Tabs
                  value={typeFilter}
                  onValueChange={(v) =>
                    setTypeFilter(v as 'all' | 'chart' | 'grid')
                  }
                >
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="chart">
                      <BarChart3Icon className="size-3.5" />
                      Charts
                    </TabsTrigger>
                    <TabsTrigger value="grid">
                      <TableIcon className="size-3.5" />
                      Grids
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div
                  className="flex items-center rounded-md border p-0.5"
                  role="group"
                  aria-label="View mode"
                >
                  <Button
                    type="button"
                    variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="size-7 p-0"
                    aria-pressed={viewMode === 'gallery'}
                    aria-label="Gallery view"
                    onClick={() => setViewMode('gallery')}
                  >
                    <LayoutGridIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="size-7 p-0"
                    aria-pressed={viewMode === 'list'}
                    aria-label="List view"
                    onClick={() => setViewMode('list')}
                  >
                    <ListIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {artifacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
                <LayersIcon className="mb-4 size-12 text-muted-foreground/40" />
                <h3 className="text-lg font-medium">No artifacts yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Save a chart or data grid from any chat conversation to see it
                  here
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
                <SearchIcon className="mb-4 size-12 text-muted-foreground/40" />
                <h3 className="text-lg font-medium">No matches</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Try a different search term or filter
                </p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="overflow-hidden rounded-xl border bg-card">
                <VirtualGrid
                  items={filtered}
                  getKey={(a) => a.id}
                  estimateSize={64}
                  gap={0}
                  overscan={6}
                  renderItem={(artifact) => (
                    <ArtifactListRow
                      artifact={artifact}
                      onSelect={() => setSelected(artifact)}
                      onDelete={() => deleteArtifact.mutate(artifact.id)}
                    />
                  )}
                />
              </div>
            ) : (
              <>
                {/* Featured */}
                {featured && (
                  <div
                    className="group relative cursor-pointer rounded-xl border bg-card p-6 transition-colors hover:bg-accent/30"
                    onClick={() => setSelected(featured)}
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            <TypeIcon
                              type={getArtifactType(featured.spec)}
                              className="size-3"
                            />
                            {typeLabel(getArtifactType(featured.spec))}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(featured.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              },
                            )}
                          </span>
                        </div>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight">
                          {featured.title}
                        </h3>
                      </div>
                      {featured.threadId && featured.messageId && (
                        <Link
                          to="/chat/$threadId"
                          params={{ threadId: featured.threadId }}
                          hash={`msg-${featured.messageId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <ExternalLinkIcon className="size-4" />
                        </Link>
                      )}
                    </div>
                    <div className="pointer-events-none overflow-hidden rounded-lg">
                      <JsonRenderDisplay
                        spec={featured.spec as unknown as Spec}
                        isStreaming={false}
                      />
                    </div>
                  </div>
                )}

                {/* Grid */}
                {rest.length > 0 && (
                  <VirtualGrid
                    items={rest}
                    getKey={(a) => a.id}
                    estimateSize={CARD_HEIGHT}
                    gap={20}
                    overscan={6}
                    measureItems={false}
                    spanLastItem={false}
                    lanes={(w) => (w >= 768 ? 2 : 1)}
                    renderItem={(artifact) => (
                      <ArtifactGalleryCard
                        artifact={artifact}
                        onSelect={() => setSelected(artifact)}
                      />
                    )}
                  />
                )}
              </>
            )}
          </div>
        </div>}

        {/* Detail dialog */}
        <Dialog
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        >
          {selected && (
            <DialogContent className="sm:max-w-[min(90vw,72rem)] max-h-[90vh] overflow-y-auto">
              <DialogTitle className="sr-only">{selected.title}</DialogTitle>
              <DialogDescription className="sr-only">
                Full-size preview of {selected.title}
              </DialogDescription>
              <div>
                <JsonRenderDisplay
                  spec={selected.spec as unknown as Spec}
                  isStreaming={false}
                />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    <TypeIcon
                      type={getArtifactType(selected.spec)}
                      className="size-3"
                    />
                    {typeLabel(getArtifactType(selected.spec))}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(selected.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteArtifact.mutate(selected.id)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                  {selected.threadId && selected.messageId && (
                    <Link
                      to="/chat/$threadId"
                      params={{ threadId: selected.threadId }}
                      hash={`msg-${selected.messageId}`}
                      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                    >
                      <ExternalLinkIcon className="size-4" />
                      View in Chat
                    </Link>
                  )}
                </div>
              </div>
            </DialogContent>
          )}
        </Dialog>
    </>
  )
}
