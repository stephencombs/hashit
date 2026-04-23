import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import type { Spec } from "@json-render/core";
import { AppPageHeader } from "~/components/app-page-header";
import {
  GenerationProgressStepper,
  useGenerationProgressMetrics,
  type GenerationProgressMetrics,
} from "~/components/dashboard/generation-progress-views";
import { HistorySheet } from "~/components/dashboard/history-sheet";
import { VirtualGrid } from "~/components/virtual-grid";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { PersistedRecipe, PersistedWidget } from "~/db/schema";
import {
  dashboardHistoryQueryKey,
  dashboardSnapshotQuery,
  dashboardSnapshotQueryKey,
  postDashboardGeneration,
} from "~/lib/dashboard-queries";
import { dashboardRenderableSpecSchema } from "~/lib/dashboard-schemas";
import { uiCatalog } from "~/lib/ui-catalog";
import { cn } from "~/lib/utils";

const CATALOG_TYPES = new Set(uiCatalog.componentNames);
const INLINE_STEPPER_LINGER_MS = 3000;
const INLINE_STEPPER_TRANSITION_MS = 500;

const JsonRenderDisplay = lazy(() =>
  import("~/components/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

type RenderableWidget = Omit<PersistedWidget, "spec"> & { spec: Spec };

export const DASHBOARD_PERSONA = "HR Admin";

function DashboardWidgetFallback() {
  return <div className="bg-muted/30 h-full w-full animate-pulse rounded-md" />;
}

function RegenerateStatusIcon({ isGenerating }: { isGenerating: boolean }) {
  if (isGenerating) {
    return <SpinnerIcon className="size-4" aria-hidden="true" />;
  }
  return <RefreshCwIcon className="size-4" aria-hidden="true" />;
}

function SpinnerIcon({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  return <Loader2Icon className={cn("animate-spin", className)} {...props} />;
}

function isRenderableSpec(spec: Spec | undefined | null): spec is Spec {
  if (!spec?.root || !spec?.elements) return false;
  if (Object.keys(spec.elements).length === 0) return false;
  const rootElement = spec.elements[spec.root];
  if (!rootElement) return false;
  return CATALOG_TYPES.has(rootElement.type);
}

function DashboardHeader({
  persona,
  isGenerating,
  onRegenerate,
  onOpenHistory,
}: {
  persona: string;
  isGenerating: boolean;
  onRegenerate: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <AppPageHeader
      title={
        <>
          <h1 className="text-sm font-medium">Dashboard</h1>
          <Badge variant="secondary">{persona}</Badge>
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="default"
            className="min-h-10"
            onClick={onOpenHistory}
          >
            <HistoryIcon className="size-4" aria-hidden />
            History
          </Button>
          <Button
            variant="ghost"
            size="default"
            className="min-h-10"
            onClick={onRegenerate}
            disabled={isGenerating}
          >
            <RegenerateStatusIcon isGenerating={isGenerating} />
            Regenerate
          </Button>
        </>
      }
    />
  );
}

function SkeletonCard() {
  return (
    <Card className="flex h-[500px] max-h-[500px] min-h-[500px] flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/4" />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <Skeleton className="h-full w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

function DashboardEmptyState({
  snapshotStatus,
  snapshotError,
  isError,
  queryError,
}: {
  snapshotStatus: "generating" | "complete" | "failed" | undefined;
  snapshotError: string | null | undefined;
  isError: boolean;
  queryError: unknown;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      {snapshotStatus === "failed" ? (
        <>
          <AlertCircleIcon className="text-muted-foreground size-12" />
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-medium text-balance">
              Generation failed
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {snapshotError ||
                "An error occurred while generating the dashboard. Try regenerating."}
            </p>
          </div>
        </>
      ) : isError ? (
        <>
          <AlertCircleIcon className="text-muted-foreground size-12" />
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-medium text-balance">
              Could not load dashboard
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {queryError instanceof Error
                ? queryError.message
                : "Request failed. Try again or regenerate."}
            </p>
          </div>
        </>
      ) : (
        <>
          <AlertCircleIcon className="text-muted-foreground size-12" />
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-medium text-balance">
              No data available
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              All data sources returned empty results or errors. Try
              regenerating the dashboard.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function CollapsibleFade({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = window.setTimeout(
      () => setMounted(false),
      INLINE_STEPPER_TRANSITION_MS,
    );
    return () => window.clearTimeout(id);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "grid w-full min-w-0 transition-[grid-template-rows,opacity,margin] duration-500 ease-out motion-reduce:transition-none",
        visible
          ? "mb-0 grid-rows-[1fr] opacity-100"
          : "-mb-6 grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="min-h-0 w-full min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

function GenerationProgressInline({
  recipes,
  widgets,
  isGenerating,
  error,
  persona,
  snapshotCompletedAt,
  metrics,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  isGenerating: boolean;
  error: string | null | undefined;
  persona: string;
  snapshotCompletedAt: string | null;
  metrics: GenerationProgressMetrics;
}) {
  const active = isGenerating || Boolean(error);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (active) {
      setOpen(true);
      return;
    }
    const id = window.setTimeout(
      () => setOpen(false),
      INLINE_STEPPER_LINGER_MS,
    );
    return () => window.clearTimeout(id);
  }, [active]);

  return (
    <CollapsibleFade open={open}>
      <GenerationProgressStepper
        recipes={recipes}
        widgets={widgets}
        isGenerating={isGenerating}
        error={error}
        metrics={metrics}
        persona={persona}
        snapshotCompletedAt={snapshotCompletedAt}
      />
    </CollapsibleFade>
  );
}

function DashboardContent({
  isFetched,
  isPending,
  isGenerating,
  recipes,
  widgets,
  renderableWidgets,
  snapshotStatus,
  snapshotError,
  snapshotCompletedAt,
  persona,
  isError,
  queryError,
}: {
  isFetched: boolean;
  isPending: boolean;
  isGenerating: boolean;
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  renderableWidgets: RenderableWidget[];
  snapshotStatus: "generating" | "complete" | "failed" | undefined;
  snapshotError: string | null | undefined;
  snapshotCompletedAt: string | null;
  persona: string;
  isError: boolean;
  queryError: unknown;
}) {
  const generationError = snapshotStatus === "failed" ? snapshotError : null;
  const metrics = useGenerationProgressMetrics(
    recipes,
    widgets,
    isGenerating,
    generationError,
  );
  const dashboardScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={dashboardScrollRef}
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-6 [scrollbar-gutter:stable_both-edges]"
      >
        {isPending && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {isFetched && (
          <GenerationProgressInline
            recipes={recipes}
            widgets={widgets}
            isGenerating={isGenerating}
            error={generationError}
            persona={persona}
            snapshotCompletedAt={snapshotCompletedAt}
            metrics={metrics}
          />
        )}

        {renderableWidgets.length > 0 ? (
          <VirtualGrid
            scrollElementRef={dashboardScrollRef}
            items={renderableWidgets}
            getKey={(widget) => widget.widgetId}
            estimateSize={500}
            gap={20}
            overscan={1}
            measureItems={false}
            lanes={(width) => (width >= 720 ? 2 : 1)}
            renderItem={(widget) => (
              <Card className="flex h-[500px] max-h-[500px] min-h-[500px] flex-col overflow-hidden">
                <CardHeader className="shrink-0">
                  <CardTitle className="line-clamp-1">{widget.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {widget.insight}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-hidden">
                  <Suspense fallback={<DashboardWidgetFallback />}>
                    <JsonRenderDisplay
                      spec={widget.spec}
                      isStreaming={false}
                      fill
                    />
                  </Suspense>
                </CardContent>
              </Card>
            )}
          />
        ) : (
          isGenerating && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <SkeletonCard key={`skeleton-${index}`} />
              ))}
            </div>
          )
        )}

        {isFetched && !isGenerating && renderableWidgets.length === 0 && (
          <DashboardEmptyState
            snapshotStatus={snapshotStatus}
            snapshotError={snapshotError}
            isError={isError}
            queryError={queryError}
          />
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const initDoneRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const {
    data,
    isFetched,
    isPending,
    isError,
    error: queryError,
  } = useQuery(dashboardSnapshotQuery(DASHBOARD_PERSONA));

  const triggerGeneration = useMutation({
    mutationFn: ({ force }: { force: boolean }) =>
      postDashboardGeneration(DASHBOARD_PERSONA, force),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dashboardSnapshotQueryKey(DASHBOARD_PERSONA),
      });
      queryClient.invalidateQueries({
        queryKey: dashboardHistoryQueryKey(DASHBOARD_PERSONA),
      });
    },
  });

  useEffect(() => {
    if (!isFetched || initDoneRef.current) return;
    initDoneRef.current = true;

    const snapshot = data?.snapshot ?? null;
    const isStale = data?.isStale ?? true;
    if ((!snapshot || isStale) && snapshot?.status !== "generating") {
      triggerGeneration.mutate({ force: false });
    }
  }, [isFetched, data, triggerGeneration]);

  const handleRegenerate = useCallback(() => {
    triggerGeneration.mutate({ force: true });
  }, [triggerGeneration]);

  const snapshot = data?.snapshot ?? null;
  const isGenerating =
    snapshot?.status === "generating" || triggerGeneration.isPending;
  const widgets = snapshot?.widgets ?? [];
  const recipes = snapshot?.recipes ?? [];

  const renderableWidgets: RenderableWidget[] = useMemo(
    () =>
      widgets.flatMap((widget) => {
        if (widget.spec === null) return [];
        const parsedSpec = dashboardRenderableSpecSchema.safeParse(widget.spec);
        if (!parsedSpec.success) return [];
        if (!isRenderableSpec(parsedSpec.data)) return [];
        return [{ ...widget, spec: parsedSpec.data }];
      }),
    [widgets],
  );

  return (
    <>
      <DashboardHeader
        persona={DASHBOARD_PERSONA}
        isGenerating={isGenerating}
        onRegenerate={handleRegenerate}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <DashboardContent
        isFetched={isFetched}
        isPending={isPending}
        isGenerating={isGenerating}
        recipes={recipes}
        widgets={widgets}
        renderableWidgets={renderableWidgets}
        snapshotStatus={snapshot?.status}
        snapshotError={snapshot?.error}
        snapshotCompletedAt={snapshot?.completedAt ?? null}
        persona={DASHBOARD_PERSONA}
        isError={isError}
        queryError={queryError}
      />
      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        persona={DASHBOARD_PERSONA}
      />
    </>
  );
}
