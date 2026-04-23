import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  formatSnapshotCompletedAt,
  type GenerationProgressMetrics,
  type RecipeStatus,
} from "~/components/dashboard/generation-progress-views";
import type { BuildEventKind } from "~/lib/dashboard-build-events";

export function StatusDot({
  status,
  className,
}: {
  status: RecipeStatus;
  className?: string;
}) {
  const styles: Record<RecipeStatus, string> = {
    queued: "bg-muted-foreground/40",
    active: "bg-primary animate-pulse",
    done: "bg-primary",
    skipped: "bg-amber-500",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        styles[status],
        className,
      )}
    />
  );
}

export function KindIcon({ kind }: { kind: BuildEventKind }) {
  if (kind === "error") {
    return <AlertCircleIcon className="text-destructive" aria-hidden />;
  }
  if (kind === "active") {
    return <Loader2Icon className="text-primary animate-spin" aria-hidden />;
  }
  if (kind === "done" || kind === "finished") {
    return <CheckIcon className="text-primary" aria-hidden />;
  }
  if (kind === "skipped") {
    return (
      <span
        aria-hidden
        className="inline-block size-3.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300"
      />
    );
  }
  return <SparklesIcon className="text-muted-foreground" aria-hidden />;
}

export function CountPill({
  value,
  tone = "muted",
}: {
  value: number;
  tone?: "muted" | "accent" | "warn" | "err" | "ok";
}) {
  const styles = {
    muted: "bg-muted text-muted-foreground",
    accent: "bg-primary/15 text-primary",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    err: "bg-destructive/15 text-destructive",
    ok: "bg-primary/15 text-primary",
  };
  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums",
        styles[tone],
      )}
    >
      {value}
    </span>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "ok" | "warn" | "muted" | "err";
}) {
  const styles = {
    ok: "bg-primary/10 text-primary border-primary/20",
    warn: "bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-200",
    muted: "bg-muted border-border text-foreground",
    err: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <div className={cn("rounded-md border p-2", styles[tone])}>
      <dd className="text-xl leading-none font-semibold tabular-nums">
        {value}
      </dd>
      <dt className="text-muted-foreground mt-1 text-[10px] font-medium tracking-wide uppercase">
        {label}
      </dt>
    </div>
  );
}

export function ProgressBar({
  processedCount,
  totalCount,
  isGenerating,
  error,
}: {
  processedCount: number;
  totalCount: number;
  isGenerating: boolean;
  error: string | null | undefined;
}) {
  const pct =
    totalCount > 0 ? Math.min(100, (processedCount / totalCount) * 100) : null;
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          error ? "bg-destructive" : "bg-primary",
          pct === null && isGenerating && "animate-pulse",
        )}
        style={{
          width: pct !== null ? `${pct}%` : isGenerating ? "36%" : "0%",
        }}
      />
    </div>
  );
}

export function StatusSummary({
  isGenerating,
  error,
  metrics,
  snapshotCompletedAt,
}: {
  isGenerating: boolean;
  error: string | null | undefined;
  metrics: GenerationProgressMetrics;
  snapshotCompletedAt: string | null;
}) {
  const {
    headerText,
    processedCount,
    totalCount,
    completedCount,
    skippedCount,
  } = metrics;
  const completed = formatSnapshotCompletedAt(snapshotCompletedAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="[&_svg]:size-3.5 [&_svg]:shrink-0">
          <KindIcon
            kind={
              error
                ? "error"
                : isGenerating
                  ? "active"
                  : totalCount > 0 && processedCount === totalCount
                    ? "finished"
                    : "planning"
            }
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-medium">{headerText}</p>
          {completed && !isGenerating && !error && (
            <p className="text-muted-foreground text-xs">
              Completed {completed}
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <StatTile label="Done" value={completedCount} tone="ok" />
        <StatTile label="Skipped" value={skippedCount} tone="warn" />
        <StatTile
          label="Pending"
          value={Math.max(0, totalCount - processedCount)}
          tone="muted"
        />
      </dl>
    </div>
  );
}
