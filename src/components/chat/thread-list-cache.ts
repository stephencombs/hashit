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
): void {
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) => [
    {
      id: OPTIMISTIC_THREAD_ID,
      title: "Untitled",
      source: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      pinnedAt: null,
    },
    ...old,
  ]);
}

/** Replaces the optimistic placeholder id with the real server thread id. */
export function promoteOptimisticToRealThread(
  queryClient: QueryClient,
  realId: string,
): void {
  queryClient.setQueryData<Thread[]>(THREADS_QUERY_KEY, (old = []) =>
    old.map((t) =>
      t.id === OPTIMISTIC_THREAD_ID ? { ...t, id: realId } : t,
    ),
  );
}

export function invalidateThreadList(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY });
}
