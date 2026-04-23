import { useMemo, type ComponentProps } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import { Item, ItemContent, ItemMedia, ItemTitle } from "~/components/ui/item";
import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { PersistedRecipe, PersistedWidget } from "~/db/schema";

/** Titles listed in Plan phase hover before truncation */
const PHASE_HOVER_RECIPE_TITLE_LIMIT = 5;
/** Recipes that show a data-source peek in Plan hover */
const PHASE_HOVER_SOURCE_PEEK_RECIPES = 3;

const phaseHoverCardContentClass =
  "w-72 max-w-[min(90vw,20rem)] space-y-2 p-3 text-xs leading-relaxed";

function formatWidgetName(widgetId: string): string {
  return widgetId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function recipeDisplayTitle(recipe: PersistedRecipe): string {
  return recipe.title || formatWidgetName(recipe.widgetId);
}

export function formatSnapshotCompletedAt(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export type RecipeStatus = "queued" | "active" | "done" | "skipped";

export function getRecipeStatus(
  recipe: PersistedRecipe,
  widget: PersistedWidget | undefined,
  activeIndex: number,
  recipeIndexById: Map<string, number>,
  isGenerating: boolean,
): RecipeStatus {
  if (widget?.spec) return "done";
  if (widget?.skipReason) return "skipped";
  if (isGenerating && recipeIndexById.get(recipe.widgetId) === activeIndex) {
    return "active";
  }
  return "queued";
}

function PhaseRailHoverPlan({
  recipes,
  isGenerating,
  persona,
}: {
  recipes: PersistedRecipe[];
  isGenerating: boolean;
  persona: string;
}) {
  if (recipes.length === 0) {
    return (
      <>
        <p className="text-foreground font-medium">Planning</p>
        <p className="text-muted-foreground">
          {isGenerating
            ? `Selecting insight widgets and data sources for ${persona}.`
            : "No plan yet."}
        </p>
      </>
    );
  }

  const preview = recipes.slice(0, PHASE_HOVER_RECIPE_TITLE_LIMIT);
  const rest = recipes.length - preview.length;

  return (
    <>
      <p className="text-foreground font-medium">
        {recipes.length} widget{recipes.length !== 1 ? "s" : ""} planned
      </p>
      <ul className="text-muted-foreground max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto">
        {preview.map((recipe) => (
          <li key={recipe.widgetId}>{recipeDisplayTitle(recipe)}</li>
        ))}
      </ul>
      {rest > 0 && <p className="text-muted-foreground">+{rest} more</p>}
      {recipes.slice(0, PHASE_HOVER_SOURCE_PEEK_RECIPES).map((recipe) => {
        const labels =
          recipe.dataSources?.slice(0, 2).map((ds) => ds.label) ?? [];
        if (labels.length === 0) return null;
        return (
          <p
            key={recipe.widgetId}
            className="text-muted-foreground text-[11px]"
          >
            <span className="text-foreground font-medium">
              {recipeDisplayTitle(recipe)}
            </span>
            : {labels.join(" · ")}
            {recipe.dataSources && recipe.dataSources.length > 2 ? "…" : ""}
          </p>
        );
      })}
    </>
  );
}

function PhaseRailHoverBuild({
  recipes,
  widgets,
  isGenerating,
  metrics,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  isGenerating: boolean;
  metrics: GenerationProgressMetrics;
}) {
  const {
    completedCount,
    skippedCount,
    processedCount,
    totalCount,
    recipeIndexById,
  } = metrics;

  const rendered = completedCount;
  const skipped = skippedCount;
  const outstanding = Math.max(0, totalCount - processedCount);

  const nextRecipe = recipes.find(
    (r) => recipeIndexById.get(r.widgetId) === widgets.length,
  );

  return (
    <>
      <p className="text-foreground font-medium">Build progress</p>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
        <dt>Rendered</dt>
        <dd className="text-foreground">{rendered}</dd>
        <dt>Skipped</dt>
        <dd className="text-foreground">{skipped}</dd>
        <dt>Not done</dt>
        <dd className="text-foreground">{outstanding}</dd>
      </dl>
      {totalCount > 0 && (
        <p className="text-muted-foreground">
          {processedCount} of {totalCount} widgets accounted for in this run.
        </p>
      )}
      {isGenerating && nextRecipe && (
        <p className="text-primary">
          Now rendering: {recipeDisplayTitle(nextRecipe)}
        </p>
      )}
      {isGenerating && !nextRecipe && totalCount > 0 && outstanding > 0 && (
        <p className="text-muted-foreground">Working through the queue…</p>
      )}
    </>
  );
}

function PhaseRailHoverFinish({
  error,
  isGenerating,
  metrics,
  completedAt,
}: {
  error: string | null | undefined;
  isGenerating: boolean;
  metrics: GenerationProgressMetrics;
  completedAt: string | null | undefined;
}) {
  const { processedCount, totalCount } = metrics;
  const done =
    !isGenerating && !error && totalCount > 0 && processedCount === totalCount;
  const when = formatSnapshotCompletedAt(completedAt ?? null);

  if (error) {
    return (
      <>
        <p className="text-destructive font-medium">Generation failed</p>
        <p className="text-muted-foreground">{error}</p>
        <p className="text-muted-foreground">
          The same message appears below the phase rail.
        </p>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p className="text-foreground font-medium">Dashboard ready</p>
        <p className="text-muted-foreground">
          All {totalCount} widget{totalCount !== 1 ? "s" : ""} processed.
        </p>
        {when ? (
          <p className="text-muted-foreground">Completed {when}.</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <p className="text-foreground font-medium">Finish</p>
      <p className="text-muted-foreground">
        {isGenerating
          ? "Final assembly runs after each widget is built."
          : totalCount === 0
            ? "Waiting for a completed plan."
            : "Generation has not finished successfully yet."}
      </p>
    </>
  );
}

export type GenerationProgressMetrics = {
  completedCount: number;
  skippedCount: number;
  processedCount: number;
  totalCount: number;
  widgetsById: Map<string, PersistedWidget>;
  recipeIndexById: Map<string, number>;
  headerText: string;
};

export function useGenerationProgressMetrics(
  recipes: PersistedRecipe[],
  widgets: PersistedWidget[],
  isGenerating: boolean,
  error: string | null | undefined,
): GenerationProgressMetrics {
  /** Only this run’s recipes — exclude widgets carried from a prior snapshot. */
  const recipeIdSet = useMemo(
    () => new Set(recipes.map((r) => r.widgetId)),
    [recipes],
  );
  const widgetsForRun = useMemo(
    () => widgets.filter((w) => recipeIdSet.has(w.widgetId)),
    [widgets, recipeIdSet],
  );

  const completedCount = widgetsForRun.filter((w) => w.spec !== null).length;
  const skippedCount = widgetsForRun.filter(
    (w) => w.spec === null && w.skipReason,
  ).length;
  const processedCount = completedCount + skippedCount;
  const totalCount = recipes.length;
  const widgetsById = useMemo(() => {
    const m = new Map<string, PersistedWidget>();
    for (const w of widgets) {
      if (recipeIdSet.has(w.widgetId)) m.set(w.widgetId, w);
    }
    return m;
  }, [widgets, recipeIdSet]);
  const recipeIndexById = useMemo(
    () => new Map(recipes.map((recipe, index) => [recipe.widgetId, index])),
    [recipes],
  );

  const headerText = isGenerating
    ? totalCount > 0
      ? `Processing widgets (${processedCount}/${totalCount})...`
      : "Planning dashboard..."
    : error
      ? "Dashboard generation failed"
      : completedCount > 0
        ? `Dashboard generated (${completedCount} widget${completedCount !== 1 ? "s" : ""})`
        : "Dashboard complete";

  return {
    completedCount,
    skippedCount,
    processedCount,
    totalCount,
    widgetsById,
    recipeIndexById,
    headerText,
  };
}

type PhaseStatus = "pending" | "active" | "complete" | "error";

/** SVG glyphs scale with the phase circle (parent must have explicit size). */
const phaseDotGlyphClass = "h-[42%] w-[42%] shrink-0";

function PhaseDot({
  status,
  className,
}: {
  status: PhaseStatus;
  className?: string;
}) {
  const base =
    "flex min-h-0 min-w-0 size-full shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium [&_svg]:pointer-events-none";
  if (status === "complete") {
    return (
      <div
        className={cn(
          base,
          "border-primary bg-primary text-primary-foreground",
          className,
        )}
        aria-hidden
      >
        <CheckIcon className={phaseDotGlyphClass} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div
        className={cn(
          base,
          "border-primary bg-background text-primary",
          className,
        )}
        aria-hidden
      >
        <SpinnerIcon className={cn("animate-spin", phaseDotGlyphClass)} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div
        className={cn(
          base,
          "border-destructive bg-destructive/10 text-destructive",
          className,
        )}
        aria-hidden
      >
        <AlertCircleIcon className={phaseDotGlyphClass} />
      </div>
    );
  }
  return (
    <div
      className={cn(
        base,
        "border-muted-foreground/25 bg-muted/30 text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      <span className="text-xs tabular-nums sm:text-sm">—</span>
    </div>
  );
}

function SpinnerIcon({
  className,
  ...props
}: ComponentProps<typeof Loader2Icon>) {
  return <Loader2Icon className={cn("animate-spin", className)} {...props} />;
}

function computePhaseSteps(
  recipes: PersistedRecipe[],
  isGenerating: boolean,
  error: string | null | undefined,
  processedCount: number,
  totalCount: number,
): { key: string; label: string; hint: string; status: PhaseStatus }[] {
  const planStatus: PhaseStatus =
    recipes.length > 0 ? "complete" : isGenerating ? "active" : "pending";

  let buildStatus: PhaseStatus;
  if (recipes.length === 0) {
    buildStatus = "pending";
  } else if (isGenerating) {
    buildStatus = "active";
  } else if (error) {
    buildStatus = "error";
  } else {
    buildStatus = "complete";
  }

  let finishStatus: PhaseStatus;
  if (error && !isGenerating) {
    finishStatus = "error";
  } else if (
    !isGenerating &&
    !error &&
    totalCount > 0 &&
    processedCount === totalCount
  ) {
    finishStatus = "complete";
  } else if (isGenerating) {
    finishStatus = "pending";
  } else {
    finishStatus = "pending";
  }

  return [
    {
      key: "plan",
      label: "Plan insights",
      hint: "Choose widgets and sources",
      status: planStatus,
    },
    {
      key: "build",
      label: "Build widgets",
      hint:
        totalCount > 0
          ? `${processedCount} of ${totalCount} ready`
          : "Waiting for plan",
      status: buildStatus,
    },
    {
      key: "finish",
      label: "Finish",
      hint: error ? "See error below" : "Assemble dashboard",
      status: finishStatus,
    },
  ];
}

export function GenerationProgressStepper({
  recipes,
  widgets,
  isGenerating,
  error,
  metrics,
  persona,
  snapshotCompletedAt,
}: {
  recipes: PersistedRecipe[];
  widgets: PersistedWidget[];
  isGenerating: boolean;
  error: string | null | undefined;
  metrics: GenerationProgressMetrics;
  persona: string;
  snapshotCompletedAt: string | null;
}) {
  const { processedCount, totalCount } = metrics;

  const steps = computePhaseSteps(
    recipes,
    isGenerating,
    error,
    processedCount,
    totalCount,
  );

  return (
    <div className="relative w-full min-w-0 px-2.5">
      <div className="grid w-full min-w-0 grid-cols-1 gap-6 sm:grid-cols-3 sm:items-stretch sm:gap-4">
        {steps.map((step) => (
          <div
            key={step.key}
            className="flex min-h-0 min-w-0 flex-col sm:h-full"
          >
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <Item
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-full min-h-0 w-full min-w-0 cursor-help flex-nowrap items-stretch"
                >
                  <button
                    type="button"
                    aria-label={`${step.label}: more details on hover or focus`}
                    className="h-full min-h-0"
                  >
                    <ItemMedia
                      variant="default"
                      className="flex min-h-0 shrink-0 items-center justify-center self-stretch"
                    >
                      <div className="aspect-square h-full max-h-36 min-h-10 w-auto max-w-full min-w-10">
                        <PhaseDot status={step.status} />
                      </div>
                    </ItemMedia>
                    <ItemContent className="min-w-0 justify-center">
                      <ItemTitle>{step.label}</ItemTitle>
                      <span className="text-muted-foreground line-clamp-2 text-left text-sm leading-normal font-normal text-pretty">
                        {step.hint}
                      </span>
                    </ItemContent>
                  </button>
                </Item>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                side="top"
                className={phaseHoverCardContentClass}
              >
                {step.key === "plan" && (
                  <PhaseRailHoverPlan
                    recipes={recipes}
                    isGenerating={isGenerating}
                    persona={persona}
                  />
                )}
                {step.key === "build" && (
                  <PhaseRailHoverBuild
                    recipes={recipes}
                    widgets={widgets}
                    isGenerating={isGenerating}
                    metrics={metrics}
                  />
                )}
                {step.key === "finish" && (
                  <PhaseRailHoverFinish
                    error={error}
                    isGenerating={isGenerating}
                    metrics={metrics}
                    completedAt={snapshotCompletedAt}
                  />
                )}
              </HoverCardContent>
            </HoverCard>
          </div>
        ))}
      </div>
      {error && (
        <p className="text-destructive mt-4 text-xs text-pretty">{error}</p>
      )}
    </div>
  );
}
