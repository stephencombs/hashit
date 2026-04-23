import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  CircleIcon,
  ClockIcon,
  HistoryIcon,
  LayersIcon,
  SparklesIcon,
  TimerIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  dashboardHistoryQuery,
  dashboardSnapshotByIdQuery,
  type DashboardSnapshotSummary,
} from "~/lib/dashboard-queries";
import type { z } from "zod";
import type { dashboardSnapshotWireSchema } from "~/lib/dashboard-schemas";

type DashboardSnapshotWire = z.infer<typeof dashboardSnapshotWireSchema>;
import {
  formatDurationMs,
  formatSnapshotCompletedAt,
  getRecipeStatus,
  recipeDisplayTitle,
  useGenerationProgressMetrics,
  type GenerationProgressMetrics,
  type RecipeStatus,
} from "~/components/dashboard/generation-progress-views";
import {
  KindIcon,
  StatusDot,
  StatTile,
} from "~/components/dashboard/generation-shared";
import { useBuildEvents, type BuildEvent } from "~/lib/dashboard-build-events";
import type { PersistedRecipe, PersistedWidget } from "~/db/schema";
import { cn } from "~/lib/utils";

type HistorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: string;
};

export function HistorySheet({
  open,
  onOpenChange,
  persona,
}: HistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="flex h-full max-h-dvh min-h-0 w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-[min(100vw,56rem)]"
      >
        <SheetHeader className="shrink-0 border-b px-4 py-4 text-left sm:pr-12">
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" aria-hidden />
            Dashboard history
          </SheetTitle>
          <SheetDescription>
            Browse past generations for {persona}. Select a run to inspect its
            plan, widgets, and timeline.
          </SheetDescription>
        </SheetHeader>
        {open ? <HistorySheetBody persona={persona} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function HistorySheetBody({ persona }: { persona: string }) {
  const historyQuery = useQuery(dashboardHistoryQuery(persona));
  const snapshots = historyQuery.data?.snapshots ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (snapshots.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !snapshots.some((s) => s.id === selectedId)) {
      setSelectedId(snapshots[0].id);
    }
  }, [snapshots, selectedId]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row">
      <div className="md:border-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:w-[22rem] md:flex-none md:shrink-0 md:border-r">
        <SnapshotsList
          snapshots={snapshots}
          isLoading={historyQuery.isLoading}
          isError={historyQuery.isError}
          error={historyQuery.error}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="border-border md:border-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t md:border-t-0 md:border-l">
        <SnapshotInspector snapshotId={selectedId} />
      </div>
    </div>
  );
}

function SnapshotsList({
  snapshots,
  isLoading,
  isError,
  error,
  selectedId,
  onSelect,
}: {
  snapshots: DashboardSnapshotSummary[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Couldn’t load history</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Request failed."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-3">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No past generations</EmptyTitle>
            <EmptyDescription>
              When you regenerate the dashboard, runs will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
      <ItemGroup>
        {snapshots.map((s) => (
          <SnapshotListItem
            key={s.id}
            snapshot={s}
            selected={s.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ItemGroup>
    </div>
  );
}

function SnapshotListItem({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: DashboardSnapshotSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const recipeStatus = recipeStatusFromSnapshotStatus(snapshot.status);
  const when = formatSnapshotCompletedAt(
    snapshot.completedAt ?? snapshot.createdAt,
  );
  const counts =
    snapshot.recipeCount > 0
      ? `${snapshot.completedCount}/${snapshot.recipeCount} rendered${
          snapshot.skippedCount > 0 ? ` · ${snapshot.skippedCount} skipped` : ""
        }`
      : snapshot.status === "generating"
        ? "Planning…"
        : "0 widgets";

  return (
    <Item
      asChild
      variant={selected ? "muted" : "outline"}
      size="sm"
      className={cn(
        "cursor-pointer transition-colors",
        selected && "ring-1 ring-ring/50",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(snapshot.id)}
        className="text-left"
      >
        <ItemMedia>
          <StatusDot status={recipeStatus} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="tabular-nums">
            {when ?? snapshot.createdAt}
          </ItemTitle>
          <ItemDescription>{counts}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <StatusBadge status={snapshot.status} />
        </ItemActions>
      </button>
    </Item>
  );
}

function StatusBadge({
  status,
}: {
  status: DashboardSnapshotSummary["status"];
}) {
  if (status === "complete") {
    return <Badge variant="secondary">Complete</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge variant="outline">Generating</Badge>;
}

function recipeStatusFromSnapshotStatus(
  status: DashboardSnapshotSummary["status"],
): RecipeStatus {
  if (status === "complete") return "done";
  if (status === "generating") return "active";
  return "skipped";
}

function SnapshotInspector({ snapshotId }: { snapshotId: string | null }) {
  const detailQuery = useQuery(dashboardSnapshotByIdQuery(snapshotId));

  if (!snapshotId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>Pick a run</EmptyTitle>
            <EmptyDescription>
              Select a snapshot from the list to view its plan, widgets, and
              events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Couldn’t load snapshot</AlertTitle>
          <AlertDescription>
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "Request failed."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const snapshot = detailQuery.data?.snapshot;
  if (!snapshot) return null;

  return <SnapshotInspectorLoaded snapshot={snapshot} />;
}

function SnapshotInspectorLoaded({
  snapshot,
}: {
  snapshot: DashboardSnapshotWire;
}) {
  const recipes: PersistedRecipe[] = snapshot.recipes ?? [];
  const widgets: PersistedWidget[] = snapshot.widgets ?? [];
  const isGenerating = snapshot.status === "generating";
  const error = snapshot.status === "failed" ? snapshot.error : null;
  const metrics = useGenerationProgressMetrics(
    recipes,
    widgets,
    isGenerating,
    error,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs
        defaultValue="summary"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b px-4 pt-3 pb-2">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="widgets">Widgets</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <TabsContent value="summary" className="mt-0 flex flex-col gap-4">
            <SummaryTab snapshot={snapshot} metrics={metrics} />
          </TabsContent>
          <TabsContent value="plan" className="mt-0">
            <PlanTab
              recipes={recipes}
              widgets={widgets}
              metrics={metrics}
              isGenerating={isGenerating}
            />
          </TabsContent>
          <TabsContent value="widgets" className="mt-0">
            <WidgetsTab
              recipes={recipes}
              widgets={widgets}
              metrics={metrics}
              isGenerating={isGenerating}
            />
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <EventsTab
              recipes={recipes}
              widgets={widgets}
              metrics={metrics}
              isGenerating={isGenerating}
              error={error}
              snapshotCreatedAt={snapshot.createdAt}
              snapshotCompletedAt={snapshot.completedAt}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function SummaryTab({
  snapshot,
  metrics,
}: {
  snapshot: {
    id: string;
    status: "generating" | "complete" | "failed";
    persona: string;
    createdAt: string;
    completedAt: string | null;
    error: string | null;
  };
  metrics: GenerationProgressMetrics;
}) {
  const { completedCount, skippedCount, processedCount, totalCount } = metrics;
  const pending = Math.max(0, totalCount - processedCount);
  const durationMs = snapshot.completedAt
    ? Math.max(
        0,
        new Date(snapshot.completedAt).getTime() -
          new Date(snapshot.createdAt).getTime(),
      )
    : null;
  const created = formatSnapshotCompletedAt(snapshot.createdAt);
  const completed = formatSnapshotCompletedAt(snapshot.completedAt);

  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Done" value={completedCount} tone="ok" />
        <StatTile label="Skipped" value={skippedCount} tone="warn" />
        <StatTile label="Pending" value={pending} tone="muted" />
        <StatTile
          label="Duration"
          value={durationMs !== null ? formatDurationMs(durationMs) : "—"}
          tone="muted"
        />
      </dl>

      <ItemGroup>
        <Item variant="outline" size="sm">
          <ItemMedia variant="icon">
            <SparklesIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Persona</ItemTitle>
            <ItemDescription>{snapshot.persona}</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="outline" size="sm">
          <ItemMedia variant="icon">
            <CalendarClockIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Started</ItemTitle>
            <ItemDescription>{created ?? snapshot.createdAt}</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="outline" size="sm">
          <ItemMedia variant="icon">
            <ClockIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Completed</ItemTitle>
            <ItemDescription>
              {completed ??
                (snapshot.status === "generating" ? "In progress" : "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="outline" size="sm">
          <ItemMedia variant="icon">
            <TimerIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Snapshot id</ItemTitle>
            <ItemDescription className="font-mono text-xs break-all">
              {snapshot.id}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <StatusBadge status={snapshot.status} />
          </ItemActions>
        </Item>
      </ItemGroup>

      {snapshot.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription>{snapshot.error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function PlanTab({
  recipes,
  widgets,
  metrics,
  isGenerating,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  metrics: GenerationProgressMetrics;
  isGenerating: boolean;
}) {
  if (recipes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>No plan</EmptyTitle>
          <EmptyDescription>
            This run didn’t produce a plan. Check the Events tab for details.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup>
      {recipes.map((recipe) => {
        const widget = metrics.widgetsById.get(recipe.widgetId);
        const status = getRecipeStatus(
          recipe,
          widget,
          widgets.length,
          metrics.recipeIndexById,
          isGenerating,
        );
        const sources =
          recipe.dataSources?.map((ds) => ds.label).join(" · ") ?? "";
        return (
          <Item key={recipe.widgetId} variant="outline" className="items-start">
            <ItemMedia>
              <StatusDot status={status} />
            </ItemMedia>
            <ItemContent className="min-w-0 flex-1">
              <ItemTitle>{recipeDisplayTitle(recipe)}</ItemTitle>
              <ItemDescription className="min-w-0 text-pretty">
                {recipe.insight}
                {sources ? (
                  <>
                    <br />
                    <span className="text-xs">Sources: {sources}</span>
                  </>
                ) : null}
              </ItemDescription>
              <details className="border-border bg-muted/25 mt-3 w-full min-w-0 rounded-md border">
                <summary className="text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer list-none px-3 py-2 text-xs font-medium transition-colors [&::-webkit-details-marker]:hidden">
                  Render instructions
                </summary>
                <div className="border-border text-foreground max-h-56 overflow-y-auto overscroll-contain border-t px-3 py-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                  {recipe.render}
                </div>
              </details>
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

function WidgetsTab({
  recipes,
  widgets,
  metrics,
  isGenerating,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  metrics: GenerationProgressMetrics;
  isGenerating: boolean;
}) {
  if (recipes.length === 0 && widgets.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleIcon />
          </EmptyMedia>
          <EmptyTitle>No widgets</EmptyTitle>
          <EmptyDescription>
            No widgets have been recorded for this run yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup>
      {recipes.map((recipe) => {
        const widget = metrics.widgetsById.get(recipe.widgetId);
        const status = getRecipeStatus(
          recipe,
          widget,
          widgets.length,
          metrics.recipeIndexById,
          isGenerating,
        );
        const title = widget?.title ?? recipeDisplayTitle(recipe);
        const insight = widget?.insight ?? recipe.insight;

        return (
          <Item key={recipe.widgetId} variant="outline">
            <ItemMedia>
              <StatusDot status={status} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{title}</ItemTitle>
              <ItemDescription>
                {insight}
                {widget?.skipReason ? (
                  <>
                    <br />
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Skipped: {widget.skipReason}
                    </span>
                  </>
                ) : null}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <WidgetStatusBadge status={status} />
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

function WidgetStatusBadge({ status }: { status: RecipeStatus }) {
  if (status === "done") return <Badge variant="secondary">Rendered</Badge>;
  if (status === "skipped") return <Badge variant="outline">Skipped</Badge>;
  if (status === "active") return <Badge variant="outline">Rendering</Badge>;
  return <Badge variant="outline">Queued</Badge>;
}

function EventsTab({
  recipes,
  widgets,
  metrics,
  isGenerating,
  error,
  snapshotCreatedAt,
  snapshotCompletedAt,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  metrics: GenerationProgressMetrics;
  isGenerating: boolean;
  error: string | null | undefined;
  snapshotCreatedAt: string;
  snapshotCompletedAt: string | null;
}) {
  const events = useBuildEvents({
    recipes,
    widgets,
    isGenerating,
    error,
    metrics,
    snapshotCreatedAt,
    snapshotCompletedAt,
  });

  const rows: BuildEvent[] = useMemo(() => events, [events]);

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No events</EmptyTitle>
          <EmptyDescription>
            This run didn’t emit any events we could reconstruct.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup>
      {rows.map((event) => (
        <Item key={event.id} variant="outline" size="sm">
          <ItemMedia variant="icon">
            <KindIcon kind={event.kind} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className={toneToClass(event.tone)}>
              {event.text}
            </ItemTitle>
            {event.detail ? (
              <ItemDescription>{event.detail}</ItemDescription>
            ) : null}
          </ItemContent>
          {event.time ? (
            <ItemActions>
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {event.time}
              </span>
            </ItemActions>
          ) : null}
        </Item>
      ))}
    </ItemGroup>
  );
}

function toneToClass(tone: BuildEvent["tone"]): string {
  if (tone === "ok") return "text-foreground";
  if (tone === "warn") return "text-amber-700 dark:text-amber-300";
  if (tone === "err") return "text-destructive";
  if (tone === "muted") return "text-muted-foreground";
  return "text-primary";
}
