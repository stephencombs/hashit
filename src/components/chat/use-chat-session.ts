import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessagePart } from "@tanstack/ai";
import type { Spec } from "@json-render/core";
import { useModelSettings } from "~/hooks/use-model-settings";
import { useMcpSettings } from "~/hooks/use-mcp-settings";
import {
  artifactsByThreadQuery,
  threadDetailQuery,
  type ThreadArtifact,
} from "~/lib/queries";
import { LiveSpecStore } from "~/lib/live-spec-store";
import {
  insertOptimisticThread,
  invalidateThreadList,
  promoteOptimisticToRealThread,
} from "~/components/chat/thread-list-cache";

export type ChatMessageShape = {
  id: string;
  role: "user" | "assistant";
  parts: Array<MessagePart>;
};

export interface UseChatSessionOptions {
  /** Route param / loader thread id; undefined on the new-chat index route. */
  threadId?: string;
  initialMessages?: Array<ChatMessageShape>;
  onThreadCreated?: (threadId: string) => void;
  /**
   * When true, cancel thread detail + artifacts queries on unmount (standalone
   * `Chat` remounts per thread via `key={threadId}`).
   */
  cancelQueriesOnUnmount?: boolean;
  /**
   * When true (e.g. `ChatProvider`), on `threadId` change: stop the stream,
   * swap messages, clear live specs + form state — without remounting.
   */
  syncOnRouteThreadChange?: boolean;
}

function useScrollToHashOnMount(): void {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);
}

/**
 * Shared TanStack AI chat wiring: SSE, custom events, resolved thread id for
 * new-chat flows, live spec store, and thread-list cache updates.
 */
export function useChatSession({
  threadId: routeThreadId,
  initialMessages,
  onThreadCreated,
  cancelQueriesOnUnmount = false,
  syncOnRouteThreadChange = false,
}: UseChatSessionOptions) {
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

  const [liveSpecStore] = useState(() => new LiveSpecStore());

  const [submittedFormData, setSubmittedFormData] = useState<
    Map<string, Record<string, unknown>>
  >(new Map());

  const [resolvedThreadId, setResolvedThreadId] = useState<string | undefined>(
    () => routeThreadId,
  );
  const resolvedThreadIdRef = useRef<string | undefined>(routeThreadId);
  const navigatedRef = useRef(false);

  const prevRouteThreadIdRef = useRef(routeThreadId);
  useLayoutEffect(() => {
    if (prevRouteThreadIdRef.current === routeThreadId) return;
    prevRouteThreadIdRef.current = routeThreadId;
    if (routeThreadId !== undefined) {
      resolvedThreadIdRef.current = routeThreadId;
      setResolvedThreadId(routeThreadId);
      navigatedRef.current = false;
    }
  }, [routeThreadId]);

  /** Canonical id for API body, queries, and scroll memory after `thread_created`. */
  const activeThreadId = resolvedThreadId;

  const { data: threadArtifacts } = useQuery({
    ...artifactsByThreadQuery(activeThreadId ?? ""),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (!cancelQueriesOnUnmount) return;
    return () => {
      if (!routeThreadId) return;
      queryClient.cancelQueries({
        queryKey: threadDetailQuery(routeThreadId).queryKey,
        exact: true,
      });
      queryClient.cancelQueries({
        queryKey: artifactsByThreadQuery(routeThreadId).queryKey,
        exact: true,
      });
    };
  }, [routeThreadId, queryClient, cancelQueriesOnUnmount]);

  const savedArtifactKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of threadArtifacts ?? []) {
      if (a.messageId) {
        keys.add(`${a.messageId}:${a.specIndex ?? 0}`);
      }
    }
    return keys;
  }, [threadArtifacts]);

  const messagesRef = useRef<Array<{ id: string }>>([]);

  const navigateIfReady = useCallback(() => {
    if (
      !routeThreadId &&
      resolvedThreadIdRef.current &&
      onThreadCreated &&
      !navigatedRef.current
    ) {
      navigatedRef.current = true;
      invalidateThreadList(queryClient);
      onThreadCreated(resolvedThreadIdRef.current);
    }
  }, [routeThreadId, onThreadCreated, queryClient]);

  const { messages, sendMessage, status, addToolResult, setMessages, stop } =
    useChat({
      id: routeThreadId,
      connection: fetchServerSentEvents("/api/chat"),
      initialMessages: initialMessages as Array<ChatMessageShape>,
      body: {
        threadId: resolvedThreadId,
        model,
        temperature,
        systemPrompt,
        selectedServers,
        enabledTools,
      },
      onCustomEvent: (
        eventType: string,
        data: unknown,
        _context: { toolCallId?: string },
      ) => {
        if (eventType === "thread_created") {
          const { threadId: realId } = data as { threadId: string };
          resolvedThreadIdRef.current = realId;
          setResolvedThreadId(realId);
          promoteOptimisticToRealThread(queryClient, realId);
        }
        if (eventType === "persistence_complete") {
          invalidateThreadList(queryClient);
          navigateIfReady();
        }
        if (eventType === "spec_patch" || eventType === "spec_complete") {
          const { spec, specIndex: idx } = data as {
            spec: Spec;
            specIndex: number;
          };
          const lastMsg = messagesRef.current[messagesRef.current.length - 1];
          if (lastMsg) {
            liveSpecStore.set(lastMsg.id, idx, spec);
          }
        }
      },
      onFinish: () => {
        // Navigation is handled by persistence_complete custom event instead.
      },
    });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const lastSyncedRouteThreadIdRef = useRef(routeThreadId);
  useLayoutEffect(() => {
    if (!syncOnRouteThreadChange) return;
    if (lastSyncedRouteThreadIdRef.current === routeThreadId) return;
    lastSyncedRouteThreadIdRef.current = routeThreadId;

    stop();
    setMessages((initialMessages as ChatMessageShape[] | undefined) ?? []);
    liveSpecStore.clear();
    setSubmittedFormData(new Map());

    if (routeThreadId !== undefined) {
      resolvedThreadIdRef.current = routeThreadId;
      setResolvedThreadId(routeThreadId);
    }
    navigatedRef.current = false;
  }, [
    routeThreadId,
    initialMessages,
    stop,
    setMessages,
    syncOnRouteThreadChange,
    liveSpecStore,
  ]);

  useScrollToHashOnMount();

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = new Date();
      if (!resolvedThreadId) {
        insertOptimisticThread(queryClient, now);
      }
      // Existing threads: do not touch `['threads']` here — sidebar/command
      // palette refresh on `persistence_complete` invalidation instead.

      sendMessage(trimmed);
    },
    [resolvedThreadId, queryClient, sendMessage],
  );

  const handleSaveArtifact = useCallback(
    async (spec: Spec, messageId?: string, specIndex = 0) => {
      const root = spec.elements?.[spec.root] as
        | { props?: { title?: string } }
        | undefined;
      const title =
        root?.props?.title ||
        `Chart – ${new Date().toLocaleDateString()}`;

      const tid = activeThreadId;
      try {
        const res = await fetch("/api/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            spec,
            threadId: tid,
            messageId,
            specIndex,
          }),
        });
        if (res.ok && tid) {
          const created = (await res.json()) as ThreadArtifact;
          queryClient.setQueryData<ThreadArtifact[]>(
            artifactsByThreadQuery(tid).queryKey,
            (prev = []) => [created, ...prev],
          );
        }
      } catch {
        // best-effort
      }
    },
    [activeThreadId, queryClient],
  );

  const handleFormSubmit = useCallback(
    (toolCallId: string, data: Record<string, unknown>) => {
      setSubmittedFormData((prev) => {
        const next = new Map(prev);
        next.set(toolCallId, data);
        return next;
      });
      addToolResult({
        toolCallId,
        tool: "collect_form_data",
        output: data,
      });
    },
    [addToolResult],
  );

  const isStreaming = status !== "ready";
  const lastMessage = messages[messages.length - 1];
  const hasAssistantContent =
    lastMessage?.role === "assistant" &&
    (lastMessage.parts.length > 0 ||
      (liveSpecStore.getSnapshot().get(lastMessage.id)?.length ?? 0) > 0);
  const isAwaitingResponse = isStreaming && !hasAssistantContent;

  return {
    routeThreadId,
    activeThreadId,
    messages,
    sendMessage,
    status,
    addToolResult,
    setMessages,
    stop,
    liveSpecStore,
    submittedFormData,
    setSubmittedFormData,
    savedArtifactKeys,
    handleSubmit,
    handleSaveArtifact,
    handleFormSubmit,
    isStreaming,
    isAwaitingResponse,
  };
}
