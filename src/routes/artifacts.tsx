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
import { AppSidebar } from '~/components/app-sidebar'
import { Separator } from '~/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { JsonRenderDisplay } from '~/components/json-render-display'
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
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type { Spec } from '@json-render/core'

interface Artifact {
  id: string
  title: string
  spec: Record<string, unknown>
  threadId: string | null
  messageId: string | null
  createdAt: string
}

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

export const Route = createFileRoute('/artifacts')({
  component: ArtifactsPage,
})

type ViewMode = 'gallery' | 'list'

function ArtifactsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'chart' | 'grid'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [selected, setSelected] = useState<Artifact | null>(null)

  const { data: artifacts = [] } = useQuery<Artifact[]>({
    queryKey: ['artifacts'],
    queryFn: async () => {
      const res = await fetch('/api/artifacts')
      if (!res.ok) throw new Error('Failed to fetch artifacts')
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
  })

  const deleteArtifact = useMutation({
    mutationFn: async (artifactId: string) => {
      await fetch(`/api/artifacts/${artifactId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] })
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
    <SidebarProvider
      style={{ '--sidebar-width': '280px' } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b bg-background p-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <h1 className="text-sm font-medium">Artifacts</h1>
        </header>

        <div className="flex-1 p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Gallery
                </h2>
                <p className="text-sm text-muted-foreground">
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
              <div className="divide-y rounded-xl border bg-card">
                {filtered.map((artifact) => {
                  const artType = getArtifactType(artifact.spec)
                  return (
                    <div
                      key={artifact.id}
                      className="group relative flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/30"
                      onClick={() => setSelected(artifact)}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <TypeIcon type={artType} className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium">
                          {artifact.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {typeLabel(artType)}
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {new Date(artifact.createdAt).toLocaleDateString(
                          undefined,
                          {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          },
                        )}
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
                            deleteArtifact.mutate(artifact.id)
                          }}
                          aria-label={`Delete ${artifact.title}`}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
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
                  <div className="grid gap-5 md:grid-cols-2">
                    {rest.map((artifact) => {
                      const artType = getArtifactType(artifact.spec)
                      return (
                        <div
                          key={artifact.id}
                          className="group relative flex h-full cursor-pointer flex-col rounded-xl border bg-card overflow-hidden transition-colors hover:bg-accent/30"
                          onClick={() => setSelected(artifact)}
                        >
                          <div className="pointer-events-none min-h-[220px] flex-1 overflow-hidden p-4">
                            <JsonRenderDisplay
                              spec={artifact.spec as unknown as Spec}
                              isStreaming={false}
                            />
                          </div>
                          <div className="mt-auto flex items-center gap-3 border-t px-4 py-3">
                            <Badge variant="outline" className="shrink-0">
                              <TypeIcon
                                type={artType}
                                className="size-3"
                              />
                              {typeLabel(artType)}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-medium">
                                {artifact.title}
                              </h3>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {new Date(
                                artifact.createdAt,
                              ).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

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
      </SidebarInset>
    </SidebarProvider>
  )
}
