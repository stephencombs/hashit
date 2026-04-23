import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getV2Collections } from "~/features/chat-v2/data/collections";
import { v2ThreadListQueryOptions } from "~/features/chat-v2/data/query-options";
import {
  parseV2ThreadActivityEventPayload,
  v2ThreadRunFinishedEvent,
  v2ThreadRunStartedEvent,
} from "../thread-activity";

const ERROR_RECONCILIATION_DEBOUNCE_MS = 2_000;

export function useV2ThreadActivitySync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { threadsCollection } = getV2Collections(queryClient);
    threadsCollection.startSyncImmediate();
    const reconcile = () =>
      queryClient.invalidateQueries({
        queryKey: v2ThreadListQueryOptions.queryKey,
        exact: true,
      });
    let errorReconcileTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleErrorReconcile = () => {
      if (errorReconcileTimeout) return;
      errorReconcileTimeout = setTimeout(() => {
        errorReconcileTimeout = null;
        void reconcile();
      }, ERROR_RECONCILIATION_DEBOUNCE_MS);
    };

    const applyThreadStreamingState = (threadId: string, isStreaming: boolean) => {
      threadsCollection.utils.writeUpdate({
        id: threadId,
        isStreaming,
        ...(isStreaming ? { updatedAt: new Date() } : {}),
      });
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

    connection.addEventListener(v2ThreadRunStartedEvent, handleStarted as EventListener);
    connection.addEventListener(v2ThreadRunFinishedEvent, handleFinished as EventListener);
    connection.onopen = () => {
      if (errorReconcileTimeout) {
        clearTimeout(errorReconcileTimeout);
        errorReconcileTimeout = null;
      }
      void reconcile();
    };
    connection.onerror = () => {
      // EventSource auto-reconnects. Debounce fallback reconciliation to avoid churn.
      scheduleErrorReconcile();
    };

    void reconcile();

    return () => {
      if (errorReconcileTimeout) {
        clearTimeout(errorReconcileTimeout);
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
