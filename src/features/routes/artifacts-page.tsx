import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3Icon,
  ExternalLinkIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  TableIcon,
  Trash2Icon,
} from "lucide-react";
import type { Spec } from "@json-render/core";
import { AppPageHeader } from "~/components/app-page-header";
import { VirtualGrid } from "~/components/virtual-grid";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  artifactsListQuery,
  type ArtifactListItem,
} from "~/lib/artifact-queries";

type ArtifactType = "chart" | "grid" | "other";
type ViewMode = "gallery" | "list";

const JsonRenderDisplay = lazy(() =>
  import("~/components/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

const CARD_HEIGHT = 360;

function getArtifactType(spec: Record<string, unknown>): ArtifactType {
  const elements = spec.elements as
    | Record<string, { type?: string }>
    | undefined;
  const root = spec.root as string | undefined;
  if (!elements || !root) return "other";
  const component = elements[root]?.type;
  if (component === "DataGrid") return "grid";
  if (component && component.endsWith("Chart")) return "chart";
  return "other";
}

function typeLabel(type: ArtifactType) {
  if (type === "chart") return "Chart";
  if (type === "grid") return "Data Grid";
  return "Visualization";
}

function TypeIcon({
  type,
  className,
}: {
  type: ArtifactType;
  className?: string;
}) {
  if (type === "grid") return <TableIcon className={className} />;
  return <BarChart3Icon className={className} />;
}

function ArtifactListRow({
  artifact,
  onSelect,
  onDelete,
}: {
  artifact: ArtifactListItem;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const artType = getArtifactType(artifact.spec);
  return (
    <div
      className="group hover:bg-accent/30 relative flex cursor-pointer items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0"
      onClick={onSelect}
    >
      <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
        <TypeIcon type={artType} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{artifact.title}</h3>
        <p className="text-muted-foreground text-xs">{typeLabel(artType)}</p>
      </div>
      <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
        {new Date(artifact.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {artifact.threadId && artifact.messageId && (
          <Link
            to="/chat/$threadId"
            params={{ threadId: artifact.threadId }}
            hash={`msg-${artifact.messageId}`}
            onClick={(event) => event.stopPropagation()}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
            aria-label="Open in chat"
          >
            <ExternalLinkIcon className="size-4" />
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive size-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${artifact.title}`}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ArtifactGalleryCard({
  artifact,
  onSelect,
}: {
  artifact: ArtifactListItem;
  onSelect: () => void;
}) {
  const artType = getArtifactType(artifact.spec);
  return (
    <div
      className="group bg-card hover:bg-accent/30 relative flex h-[360px] cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors"
      onClick={onSelect}
    >
      <div className="pointer-events-none flex h-[308px] min-h-0 flex-col overflow-hidden p-4">
        <Suspense fallback={<ArtifactRenderFallback fill />}>
          <JsonRenderDisplay
            spec={artifact.spec as unknown as Spec}
            isStreaming={false}
            fill
          />
        </Suspense>
      </div>
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-t px-4">
        <Badge variant="outline" className="shrink-0">
          <TypeIcon type={artType} className="size-3" />
          {typeLabel(artType)}
        </Badge>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{artifact.title}</h3>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          {new Date(artifact.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

function ArtifactRenderFallback({ fill = false }: { fill?: boolean }) {
  return (
    <div
      className={
        fill
          ? "bg-muted/30 h-full w-full animate-pulse rounded-md"
          : "bg-muted/30 h-[240px] w-full animate-pulse rounded-md"
      }
    />
  );
}

function ArtifactsSkeleton() {
  return (
    <div className="scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
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

        <Skeleton className="h-[340px] w-full rounded-xl" />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Skeleton className="h-[360px] rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ArtifactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "chart" | "grid">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [selected, setSelected] = useState<ArtifactListItem | null>(null);

  const { data: artifacts = [], isPending } = useQuery(artifactsListQuery);

  const deleteArtifact = useMutation({
    mutationFn: async (artifactId: string) => {
      await fetch(`/api/artifacts/${artifactId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsListQuery.queryKey });
      setSelected(null);
    },
  });

  const filtered = useMemo(
    () =>
      artifacts.filter((artifact) => {
        if (
          search &&
          !artifact.title.toLowerCase().includes(search.toLowerCase())
        ) {
          return false;
        }
        if (typeFilter === "all") return true;
        return getArtifactType(artifact.spec) === typeFilter;
      }),
    [artifacts, search, typeFilter],
  );

  const featured = filtered[0] ?? null;
  const rest = filtered.slice(1);

  return (
    <>
      <AppPageHeader
        title={<h1 className="text-sm font-medium">Artifacts</h1>}
      />

      {isPending ? (
        <ArtifactsSkeleton />
      ) : (
        <div className="scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-balance">
                  Gallery
                </h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  {filtered.length === artifacts.length
                    ? `${artifacts.length} saved artifact${artifacts.length === 1 ? "" : "s"}`
                    : `${filtered.length} of ${artifacts.length} artifacts`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="Search artifacts..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-56 pl-9"
                  />
                </div>
                <Tabs
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as "all" | "chart" | "grid")
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
                    variant={viewMode === "gallery" ? "secondary" : "ghost"}
                    size="sm"
                    className="size-7 p-0"
                    aria-pressed={viewMode === "gallery"}
                    aria-label="Gallery view"
                    onClick={() => setViewMode("gallery")}
                  >
                    <LayoutGridIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="size-7 p-0"
                    aria-pressed={viewMode === "list"}
                    aria-label="List view"
                    onClick={() => setViewMode("list")}
                  >
                    <ListIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {artifacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
                <LayersIcon className="text-muted-foreground/40 mb-4 size-12" />
                <h3 className="text-lg font-medium">No artifacts yet</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                  Save a chart or data grid from any chat conversation to see it
                  here
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center">
                <SearchIcon className="text-muted-foreground/40 mb-4 size-12" />
                <h3 className="text-lg font-medium">No matches</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                  Try a different search term or filter
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div className="bg-card overflow-hidden rounded-xl border">
                <VirtualGrid
                  items={filtered}
                  getKey={(artifact) => artifact.id}
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
                {featured && (
                  <div
                    className="group bg-card hover:bg-accent/30 relative cursor-pointer rounded-xl border p-6 transition-colors"
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
                          <span className="text-muted-foreground text-xs">
                            {new Date(featured.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
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
                          onClick={(event) => event.stopPropagation()}
                          className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md p-1.5 transition-colors"
                        >
                          <ExternalLinkIcon className="size-4" />
                        </Link>
                      )}
                    </div>
                    <div className="pointer-events-none overflow-hidden rounded-lg">
                      <Suspense fallback={<ArtifactRenderFallback />}>
                        <JsonRenderDisplay
                          spec={featured.spec as unknown as Spec}
                          isStreaming={false}
                        />
                      </Suspense>
                    </div>
                  </div>
                )}

                {rest.length > 0 && (
                  <VirtualGrid
                    items={rest}
                    getKey={(artifact) => artifact.id}
                    estimateSize={CARD_HEIGHT}
                    gap={20}
                    overscan={6}
                    measureItems={false}
                    spanLastItem={false}
                    lanes={(width) => (width >= 768 ? 2 : 1)}
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
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(90vw,72rem)]">
            <DialogTitle className="sr-only">{selected.title}</DialogTitle>
            <DialogDescription className="sr-only">
              Full-size preview of {selected.title}
            </DialogDescription>
            <div>
              <Suspense fallback={<ArtifactRenderFallback />}>
                <JsonRenderDisplay
                  spec={selected.spec as unknown as Spec}
                  isStreaming={false}
                />
              </Suspense>
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
                <span className="text-muted-foreground text-xs">
                  {new Date(selected.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
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
                    className="hover:bg-accent inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
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
  );
}
