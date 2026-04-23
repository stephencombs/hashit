import type { QueryClient } from "@tanstack/react-query";
import type { Thread } from "~/lib/schemas";

/** React Query cache key for the sidebar thread list. */
export const THREADS_QUERY_KEY = ["threads"] as const;

/** Placeholder id until the server returns a real thread id. */
export const OPTIMISTIC_THREAD_ID = "optimistic-new";

/** Prepends an optimistic "Untitled" row for the first message in a new chat. */
export function insertOptimisticThread(
  queryClient: QueryClient,
  now = new Date(),
  threadId = OPTIMISTIC_THREAD_ID,
): void {
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) => {
    // Return the same reference if the optimistic row is already present so
    // React Query does not broadcast a change to subscribers.
    if (old.some((t) => t.id === threadId)) return old;
    return [
      {
        id: threadId,
        title: "Untitled",
        source: null,
        resumeOffset: null,
        isStreaming: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        pinnedAt: null,
      },
      ...old,
    ];
  });
}

/** Replaces the optimistic placeholder id with the real server thread id. */
export function promoteOptimisticToRealThread(
  queryClient: QueryClient,
  realId: string,
  optimisticId = OPTIMISTIC_THREAD_ID,
): void {
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) => {
    if (optimisticId === realId) return old;
    const optimisticIndex = old.findIndex((t) => t.id === optimisticId);
    if (optimisticIndex === -1) return old;

    // If the real row already exists, just drop the optimistic placeholder.
    if (old.some((t) => t.id === realId)) {
      return old.filter((t) => t.id !== optimisticId);
    }

    const next = old.slice();
    next[optimisticIndex] = { ...next[optimisticIndex], id: realId };
    return next;
  });
}

export function removeThreadFromList(
  queryClient: QueryClient,
  threadId: string,
): void {
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) => {
    if (!old.some((t) => t.id === threadId)) return old;
    return old.filter((t) => t.id !== threadId);
  });
}

export function setThreadTitle(
  queryClient: QueryClient,
  threadId: string,
  title: string,
): void {
  const nextTitle = title.trim();
  if (!nextTitle) return;
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) => {
    const index = old.findIndex((t) => t.id === threadId);
    if (index === -1) return old;
    if (old[index].title === nextTitle) return old;
    const next = old.slice();
    next[index] = { ...next[index], title: nextTitle };
    return next;
  });
}

export function invalidateThreadList(queryClient: QueryClient): void {
  // Keep cache correctness while avoiding immediate list refetch churn in the
  // critical first-send paint window.
  queryClient.invalidateQueries({
    queryKey: THREADS_QUERY_KEY,
    refetchType: "none",
  });
}
