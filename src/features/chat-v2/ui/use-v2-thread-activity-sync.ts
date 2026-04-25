import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getV2Collections } from "~/features/chat-v2/data/collections";
import { setV2ThreadStreamingState } from "~/features/chat-v2/data/mutations";
import { v2ThreadListQueryOptions } from "~/features/chat-v2/data/query-options";
import {
  parseV2ThreadActivityEventPayload,
  v2ThreadRunFinishedEvent,
  v2ThreadRunStartedEvent,
} from "../thread-activity";

const ERROR_RECONCILIATION_DEBOUNCE_MS = 2_000;
const UNKNOWN_THREAD_RECONCILIATION_DEBOUNCE_MS = 250;

export function useV2ThreadActivitySync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { threadsCollection } = getV2Collections(queryClient);
    threadsCollection.startSyncImmediate();
    const reconcile = () =>
      queryClient.refetchQueries({
        queryKey: v2ThreadListQueryOptions.queryKey,
        exact: true,
        // V2 thread list runs through react-db on-demand sync; the backing query can
        // be inactive even while the sidebar is visible.
        type: "all",
      });
    let errorReconcileTimeout: ReturnType<typeof setTimeout> | null = null;
    let unknownThreadReconcileTimeout: ReturnType<typeof setTimeout> | null =
      null;
    const scheduleErrorReconcile = () => {
      if (errorReconcileTimeout) return;
      errorReconcileTimeout = setTimeout(() => {
        errorReconcileTimeout = null;
        void reconcile();
      }, ERROR_RECONCILIATION_DEBOUNCE_MS);
    };
    const scheduleUnknownThreadReconcile = () => {
      if (unknownThreadReconcileTimeout) return;
      unknownThreadReconcileTimeout = setTimeout(() => {
        unknownThreadReconcileTimeout = null;
        void reconcile();
      }, UNKNOWN_THREAD_RECONCILIATION_DEBOUNCE_MS);
    };

    const applyThreadStreamingState = (
      threadId: string,
      isStreaming: boolean,
    ) => {
      const knownThread = threadsCollection.has(threadId);
      setV2ThreadStreamingState(queryClient, threadId, isStreaming);
      // Unknown events usually mean a thread was created/updated outside this client.
      // Reconcile once so the sidebar hydrates canonical thread metadata.
      if (!knownThread) {
        scheduleUnknownThreadReconcile();
      }
    };
    const parsePayload = (raw: string) => {
      try {
        return parseV2ThreadActivityEventPayload(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    };

    const connection = new EventSource("/api/v2/thread-events");
    const handleStarted = (event: MessageEvent<string>) => {
      const payload = parsePayload(event.data);
      if (!payload) return;
      applyThreadStreamingState(payload.threadId, true);
    };
    const handleFinished = (event: MessageEvent<string>) => {
      const payload = parsePayload(event.data);
      if (!payload) return;
      applyThreadStreamingState(payload.threadId, false);
    };

    connection.addEventListener(
      v2ThreadRunStartedEvent,
      handleStarted as EventListener,
    );
    connection.addEventListener(
      v2ThreadRunFinishedEvent,
      handleFinished as EventListener,
    );
    connection.onopen = () => {
      if (errorReconcileTimeout) {
        clearTimeout(errorReconcileTimeout);
        errorReconcileTimeout = null;
      }
      if (unknownThreadReconcileTimeout) {
        clearTimeout(unknownThreadReconcileTimeout);
        unknownThreadReconcileTimeout = null;
      }
      // Always reconcile on (re)connect so stale local streaming flags self-heal after
      // missed events or prolonged disconnects.
      void reconcile();
    };
    connection.onerror = () => {
      // EventSource auto-reconnects. Debounce fallback reconciliation to avoid churn.
      scheduleErrorReconcile();
    };

    return () => {
      if (errorReconcileTimeout) {
        clearTimeout(errorReconcileTimeout);
      }
      if (unknownThreadReconcileTimeout) {
        clearTimeout(unknownThreadReconcileTimeout);
      }
      connection.removeEventListener(
        v2ThreadRunStartedEvent,
        handleStarted as EventListener,
      );
      connection.removeEventListener(
        v2ThreadRunFinishedEvent,
        handleFinished as EventListener,
      );
      connection.close();
    };
  }, [queryClient]);
}
