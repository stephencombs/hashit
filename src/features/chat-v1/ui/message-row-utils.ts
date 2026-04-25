import { parsePartialJSON } from "@tanstack/ai";
import type { ToolCallPart } from "@tanstack/ai";
import type { ResolutionOutput } from "~/shared/lib/resolve-duplicate-tool";
import type {
  InteractiveToolName,
  ToolResultPart,
  ToolSummaryPart,
  UiSpecPart,
} from "~/features/chat-v1/ui/message-row.types";

const INTERACTIVE_TOOL_NAMES = new Set<InteractiveToolName>([
  "collect_form_data",
  "resolve_duplicate_entity",
]);

export function isToolCallPart(part: { type: string }): part is ToolCallPart {
  return part.type === "tool-call";
}

export function isThinkingPart(
  part: unknown,
): part is { type: "thinking"; content: string } {
  if (!part || typeof part !== "object") return false;
  return (
    (part as { type?: unknown }).type === "thinking" &&
    typeof (part as { content?: unknown }).content === "string"
  );
}

export function isToolResultPart(part: unknown): part is ToolResultPart {
  if (!part || typeof part !== "object") return false;
  return (
    (part as { type: string }).type === "tool-result" &&
    typeof (part as { toolCallId?: unknown }).toolCallId === "string" &&
    typeof (part as { state?: unknown }).state === "string"
  );
}

export function isUiSpecPart(part: unknown): part is UiSpecPart {
  if (!part || typeof part !== "object") return false;
  return (
    (part as { type: string }).type === "ui-spec" && "spec" in (part as object)
  );
}

export function isToolSummaryPart(part: unknown): part is ToolSummaryPart {
  if (!part || typeof part !== "object") return false;
  return (
    (part as { type: string }).type === "tool-summary" &&
    typeof (part as { content?: unknown }).content === "string"
  );
}

export function isInteractiveToolName(
  name: string,
): name is InteractiveToolName {
  return INTERACTIVE_TOOL_NAMES.has(name as InteractiveToolName);
}

function hasTitleAndFields(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Record<string, unknown>;
  return typeof maybe.title === "string" && Array.isArray(maybe.fields);
}

export function parseInteractiveSpec<T>(args: string): T | null {
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

export function resolveSourceUrl(source: {
  type: "url" | "data";
  value: string;
  mimeType?: string;
}): string {
  if (source.type === "url") return source.value;
  return `data:${source.mimeType ?? "application/octet-stream"};base64,${source.value}`;
}

export function formatToolLabel(
  name: string,
  argsPreview: string | undefined,
): string {
  const displayName = name.replace(/__/g, " / ");
  if (argsPreview) return `${displayName}: ${argsPreview}`;
  return displayName;
}

export function formatToolDescription(
  summary: string | undefined,
): string | undefined {
  return summary;
}

export function toToolResultContent(output: unknown): string | undefined {
  if (output == null) return undefined;
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}
