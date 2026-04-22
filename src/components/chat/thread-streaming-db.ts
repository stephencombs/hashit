import { useMemo } from "react";
import {
  createCollection,
  localOnlyCollectionOptions,
  useLiveQuery,
} from "@tanstack/react-db";

const STORAGE_KEY = "hashit:streaming-thread-ids";

type StreamingThreadRow = {
  threadId: string;
  startedAt: number;
  source?: "status" | "event";
  lastEventAt?: number;
};

function loadInitialRows(): StreamingThreadRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { rows?: unknown };
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter(
      (row): row is StreamingThreadRow =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as { threadId?: unknown }).threadId === "string" &&
        typeof (row as { startedAt?: unknown }).startedAt === "number",
    );
  } catch {
    return [];
  }
}

function persistRows(rows: StreamingThreadRow[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ rows }));
  } catch {
    // best-effort persistence only
  }
}

const streamingThreadsCollection = createCollection(
  localOnlyCollectionOptions<StreamingThreadRow, string>({
    id: "streaming-thread-state",
    getKey: (row) => row.threadId,
    initialData: loadInitialRows(),
  }),
);

function snapshotRows(): StreamingThreadRow[] {
  return streamingThreadsCollection.toArray as StreamingThreadRow[];
}

function persistSnapshot(): void {
  persistRows(snapshotRows());
}

export function hydrateStreamingState(): void {
  const hydratedRows = loadInitialRows();
  const existingIds = new Set(streamingThreadsCollection.keys());
  for (const row of hydratedRows) {
    if (existingIds.has(row.threadId)) continue;
    streamingThreadsCollection.insert(row);
  }
  persistSnapshot();
}

export function markThreadStreaming(
  threadId: string,
  source: "status" | "event" = "status",
): void {
  if (!threadId) return;
  // If the row already exists the collection's render-relevant state (presence
  // of the threadId) hasn't changed — skip the update so useLiveQuery
  // subscribers are not notified for a metadata-only write.
  if (streamingThreadsCollection.has(threadId)) return;
  const now = Date.now();
  streamingThreadsCollection.insert({
    threadId,
    startedAt: now,
    source,
    lastEventAt: now,
  });
  persistSnapshot();
}

export function clearThreadStreaming(threadId: string): void {
  if (!threadId || !streamingThreadsCollection.has(threadId)) return;
  streamingThreadsCollection.delete(threadId);
  persistSnapshot();
}

export function useIsThreadStreaming(threadId: string): boolean {
  const { data } = useLiveQuery(streamingThreadsCollection);
  if (!data) return false;
  return data.some((row) => row.threadId === threadId);
}

/**
 * Returns a stable Set of currently-streaming thread IDs. Intended for use at
 * a parent (section/list) level so that a single collection subscription drives
 * derived boolean props for all rows, rather than each row subscribing to the
 * full collection independently.
 */
export function useStreamingThreadIds(): ReadonlySet<string> {
  const { data } = useLiveQuery(streamingThreadsCollection);
  return useMemo(
    () => new Set(data?.map((row) => row.threadId) ?? []),
    [data],
  );
}

export function useStreamingThreadCount(): number {
  const { data } = useLiveQuery(streamingThreadsCollection);
  return data?.length ?? 0;
}
