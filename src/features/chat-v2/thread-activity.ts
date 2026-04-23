export const v2ThreadRunStartedEvent = "thread_run_started" as const;
export const v2ThreadRunFinishedEvent = "thread_run_finished" as const;

export type V2ThreadActivityEventType =
  | typeof v2ThreadRunStartedEvent
  | typeof v2ThreadRunFinishedEvent;

export type V2ThreadActivityEventPayload = {
  threadId: string;
  at: string;
};

export function parseV2ThreadActivityEventPayload(
  value: unknown,
): V2ThreadActivityEventPayload | null {
  if (typeof value !== "object" || value == null) return null;
  const threadId = (value as { threadId?: unknown }).threadId;
  const at = (value as { at?: unknown }).at;
  if (typeof threadId !== "string" || threadId.trim().length === 0) return null;
  if (typeof at !== "string" || at.trim().length === 0) return null;
  return {
    threadId,
    at,
  };
}
