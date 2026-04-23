/**
 * Single-slot, per-tool-name promise registry bridging TanStack AI `.client()`
 * handlers with user-driven UI submissions.
 *
 * TanStack AI's `ClientTool.execute(args)` receives only the tool input — no
 * toolCallId — so we cannot key pending promises by toolCallId from inside
 * the handler. We key by tool name instead. This is sound because at most one
 * interactive tool can be paused at a time: the server stream is paused on
 * the `.client()` handler's await, the composer is gated while a tool-call is
 * unresolved, and both the LLM and the UI only drive one HITL interaction per
 * turn.
 *
 * Flow:
 *   1. `.client()` handler calls `registerPending(name)` and awaits the
 *      returned promise. The TanStack AI runtime blocks the agent loop on
 *      that await.
 *   2. The interactive UI renders the tool-call part, collects input, and
 *      calls `resolvePending(name, output)`. The `.client()` handler's
 *      return value becomes the tool output. The runtime then persists the
 *      tool-call part with `state: "result"` + `output` and resumes the
 *      agent loop by POSTing a continuation.
 *   3. `cancelPending(name, reason)` rejects any outstanding entry for that
 *      tool. Call on thread switch / `stop()` to avoid leaking promises.
 */

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const pending = new Map<string, PendingEntry>();

export function registerPending<T>(toolName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const existing = pending.get(toolName);
    if (existing) {
      // Previous pending invocation was never resolved (e.g. stale navigation).
      // Reject it so its `.client()` handler errors out cleanly and the new
      // one owns the slot.
      existing.reject(new Error("superseded"));
    }
    pending.set(toolName, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
  });
}

export function resolvePending(toolName: string, output: unknown): boolean {
  const entry = pending.get(toolName);
  if (!entry) return false;
  pending.delete(toolName);
  entry.resolve(output);
  return true;
}

export function cancelPending(
  toolName: string,
  reason: string = "cancelled",
): boolean {
  const entry = pending.get(toolName);
  if (!entry) return false;
  pending.delete(toolName);
  entry.reject(new Error(reason));
  return true;
}

export function cancelAllPending(reason: string = "cancelled"): number {
  const names = Array.from(pending.keys());
  for (const name of names) {
    const entry = pending.get(name);
    if (!entry) continue;
    pending.delete(name);
    entry.reject(new Error(reason));
  }
  return names.length;
}

export function hasPending(toolName: string): boolean {
  return pending.has(toolName);
}

export const INTERACTIVE_TOOL_NAMES = [
  "collect_form_data",
  "resolve_duplicate_entity",
] as const;

export type InteractiveToolName = (typeof INTERACTIVE_TOOL_NAMES)[number];

export function isInteractiveToolName(
  name: string,
): name is InteractiveToolName {
  return (INTERACTIVE_TOOL_NAMES as readonly string[]).includes(name);
}
