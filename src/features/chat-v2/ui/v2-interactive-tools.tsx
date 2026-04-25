import { parsePartialJSON } from "@tanstack/ai";
import type { ResolutionOutput } from "~/shared/lib/resolve-duplicate-tool";

export type V2InteractiveToolName =
  | "collect_form_data"
  | "resolve_duplicate_entity";

function hasTitleAndFields(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Record<string, unknown>;
  return typeof maybe.title === "string" && Array.isArray(maybe.fields);
}

export function parseV2InteractiveSpec<T>(args: string): T | null {
  try {
    const parsed = parsePartialJSON(args);
    return hasTitleAndFields(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function hasCollectFormDataOutput(
  output: unknown,
): output is { data: Record<string, unknown> } {
  if (!output || typeof output !== "object") return false;
  const maybe = output as { data?: unknown };
  return (
    !!maybe.data && typeof maybe.data === "object" && !Array.isArray(maybe.data)
  );
}

export function hasResolutionOutput(
  output: unknown,
): output is ResolutionOutput {
  if (!output || typeof output !== "object") return false;
  const maybe = output as {
    actionId?: unknown;
    values?: unknown;
    changes?: unknown;
  };
  return (
    typeof maybe.actionId === "string" &&
    !!maybe.values &&
    typeof maybe.values === "object" &&
    !Array.isArray(maybe.values) &&
    !!maybe.changes &&
    typeof maybe.changes === "object" &&
    !Array.isArray(maybe.changes)
  );
}

export function V2InteractiveToolFallback({ message }: { message: string }) {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
      {message}
    </div>
  );
}
