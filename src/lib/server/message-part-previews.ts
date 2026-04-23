/**
 * Server-side helpers that compute pre-baked display strings for tool-call
 * arguments and tool-result content. By computing these once at persistence
 * time, the client render path never needs to JSON.parse a part payload.
 */

/**
 * Extracts a short human-readable suffix from serialized tool-call arguments.
 * Returns the first 1-2 scalar values (strings / numbers) joined by ", ", or
 * undefined when the args are empty, non-object, or malformed JSON.
 *
 * The display *name* (derived from the tool name) is intentionally kept on the
 * client because it is a presentation concern. This function only returns the
 * value suffix so that `formatToolLabel` can concatenate them without parsing.
 */
export function buildArgsPreview(args: string): string | undefined {
  if (!args) return undefined;
  try {
    const parsed = JSON.parse(args) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const vals = Object.values(parsed as Record<string, unknown>).filter(
      (v) => typeof v === "string" || typeof v === "number",
    );
    if (vals.length === 0) return undefined;
    const summary = vals.slice(0, 2).join(", ");
    return summary.length > 60 ? summary.slice(0, 57) + "..." : summary;
  } catch {
    return undefined;
  }
}

/**
 * Produces a compact description string from serialized tool-result content.
 * Rules (in order):
 *   - JSON array   → "{n} result(s)"
 *   - JSON object  → key names (up to 3) or "{n} fields"
 *   - Plain string → truncated to 80 chars
 *   - Malformed / undefined → undefined
 *
 * Mirrors the display logic previously inline in `formatToolDescription` so the
 * client can consume `part.summary` directly without any further parsing.
 */
export function buildResultSummary(
  content: string | undefined,
): string | undefined {
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return `${parsed.length} result${parsed.length === 1 ? "" : "s"}`;
    }
    if (typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed as object);
      return keys.length <= 3 ? keys.join(", ") : `${keys.length} fields`;
    }
  } catch {
    // Fall through to the string truncation below.
  }
  return content.length > 80 ? content.slice(0, 77) + "..." : content;
}
