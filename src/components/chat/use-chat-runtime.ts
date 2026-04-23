import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@tanstack/ai-react";
import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Spec } from "@json-render/core";
import type { PromptInputMessage } from "~/components/ai-elements/prompt-input";
import {
  insertOptimisticThread,
  invalidateThreadList,
  removeThreadFromList,
  promoteOptimisticToRealThread,
  setThreadTitle,
} from "~/components/chat/thread-list-cache";
import {
  clearThreadStreaming,
  markThreadStreaming,
} from "~/components/chat/thread-streaming-db";
import {
  isLocalOrPrivateAttachmentUrl,
  toAbsoluteAttachmentUrl,
  uploadAttachmentSource,
} from "~/components/chat/chat-session-attachments";
import { getPendingInteractiveTarget } from "~/components/chat/chat-session-interactive";
import type {
  ChatMessageShape,
  UseChatControllerOptions,
} from "~/components/chat/chat-session-types";
import { useMcpSettings } from "~/hooks/use-mcp-settings";
import { useModelSettings } from "~/hooks/use-model-settings";
import { LiveSpecStore } from "~/lib/live-spec-store";
import {
  buildPromptContentParts,
  isVisionCapableModel,
} from "~/lib/multimodal-parts";
import {
  artifactsByThreadQuery,
  threadDetailQuery,
  type ThreadArtifact,
} from "~/lib/queries";
import {
  collectFormDataTool,
  type CollectFormDataOutput,
} from "~/lib/form-tool";
import {
  resolveDuplicateEntityTool,
  type ResolutionOutput,
} from "~/lib/resolve-duplicate-tool";
import {
  cancelAllPending,
  registerPending,
  resolvePending,
  type InteractiveToolName,
} from "~/lib/interactive-tool-registry";

const noopConnection = {
  subscribe: async function* () {},
  send: async () => {},
} as const;

const TERMINAL_RUN_EVENT_TYPES = new Set([
  "run_complete",
  "run_aborted",
  "run_waiting_input",
  "run_error",
  "persistence_complete",
]);

type PendingSend =
  | { kind: "text"; value: string }
  | { kind: "parts"; content: ReturnType<typeof buildPromptContentParts> };

const OPTIMISTIC_SIDEBAR_INSERT_DELAY_MS = 48;

function createClientThreadId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `thread_${crypto.randomUUID()}`;
  }
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createClientMessageId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `msg_${crypto.randomUUID()}`;
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toOptimisticUserMessage(
  id: string,
  pending: PendingSend,
): ChatMessageShape {
  if (pending.kind === "text") {
    return {
      id,
      role: "user",
      parts: [{ type: "text", content: pending.value }],
    };
  }
  return {
    id,
    role: "user",
    parts: pending.content as ChatMessageShape["parts"],
  };
}

export function useChatRuntime({
  threadId: routeThreadId,
  initialMessages,
  initialResumeOffset,
  onThreadCreated,
  cancelQueriesOnUnmount = false,
  syncOnRouteThreadChange = false,
}: UseChatControllerOptions) {
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

  const [liveSpecStore] = useState(() => new LiveSpecStore());
  const [resolvedThreadId, setResolvedThreadId] = useState<string | undefined>(
    () => routeThreadId,
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isBootstrappingThread, setIsBootstrappingThread] = useState(false);
  const [optimisticUserMessage, setOptimisticUserMessage] =
    useState<ChatMessageShape | null>(null);
  const hasHashTarget = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.hash.length > 1;
  }, [routeThreadId]);

  const resolvedThreadIdRef = useRef<string | undefined>(routeThreadId);
  const navigatedRef = useRef(false);
  const messagesRef = useRef<Array<{ id: string }>>([]);
  const pendingFirstMessageRef = useRef<PendingSend | null>(null);
  const pendingThreadCreationIdRef = useRef<string | null>(null);
  const pendingOptimisticUserMessageIdRef = useRef<string | null>(null);
  const sidebarInsertTimeoutRef = useRef<number | null>(null);
  const hashScrollTriggeredRef = useRef(false);
  const hasUserSubmittedRef = useRef(false);

  const clearPendingSidebarInsert = useCallback(() => {
    if (typeof window === "undefined") return;
    if (sidebarInsertTimeoutRef.current === null) return;
    window.clearTimeout(sidebarInsertTimeoutRef.current);
    sidebarInsertTimeoutRef.current = null;
  }, []);

  const scheduleOptimisticSidebarInsert = useCallback(
    (threadId: string) => {
      if (typeof window === "undefined") {
        insertOptimisticThread(queryClient, new Date(), threadId);
        markThreadStreaming(threadId, "status");
        return;
      }
      clearPendingSidebarInsert();
      sidebarInsertTimeoutRef.current = window.setTimeout(() => {
        sidebarInsertTimeoutRef.current = null;
        insertOptimisticThread(queryClient, new Date(), threadId);
        markThreadStreaming(threadId, "status");
      }, OPTIMISTIC_SIDEBAR_INSERT_DELAY_MS);
    },
    [clearPendingSidebarInsert, queryClient],
  );

  const prevRouteThreadIdRef = useRef(routeThreadId);
  useLayoutEffect(() => {
    if (prevRouteThreadIdRef.current === routeThreadId) return;
    prevRouteThreadIdRef.current = routeThreadId;
    if (routeThreadId === undefined) return;
    resolvedThreadIdRef.current = routeThreadId;
    setResolvedThreadId(routeThreadId);
    setIsBootstrappingThread(false);
    pendingThreadCreationIdRef.current = null;
    pendingFirstMessageRef.current = null;
    pendingOptimisticUserMessageIdRef.current = null;
    hashScrollTriggeredRef.current = false;
    setOptimisticUserMessage(null);
    clearPendingSidebarInsert();
    navigatedRef.current = false;
  }, [clearPendingSidebarInsert, routeThreadId]);

  const activeThreadId = resolvedThreadId;

  const { data: threadArtifacts } = useQuery({
    ...artifactsByThreadQuery(activeThreadId ?? ""),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (!cancelQueriesOnUnmount || !routeThreadId) return;
    return () => {
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
    for (const artifact of threadArtifacts ?? []) {
      if (!artifact.messageId) continue;
      keys.add(`${artifact.messageId}:${artifact.specIndex ?? 0}`);
    }
    return keys;
  }, [threadArtifacts]);

  const navigateIfReady = useCallback(async () => {
    if (
      routeThreadId ||
      !resolvedThreadIdRef.current ||
      !onThreadCreated ||
      navigatedRef.current
    ) {
      return;
    }
    navigatedRef.current = true;
    const tid = resolvedThreadIdRef.current;

    try {
      // Load the authoritative persisted thread snapshot before navigating so
      // the destination route hydrates from server-truth (including resume
      // offset) instead of speculative local message state.
      await Promise.all([
        queryClient.fetchQuery(threadDetailQuery(tid)),
        queryClient.prefetchQuery(artifactsByThreadQuery(tid)),
      ]);
    } catch {
      // Fallback: preserve currently visible messages if preloading fails.
      queryClient.setQueryData(threadDetailQuery(tid).queryKey, {
        id: tid,
        title: "Untitled",
        messages: messagesRef.current.map((m) => {
          const message = m as {
            role: string;
            parts?: unknown;
            content?: unknown;
          };
          return {
            id: m.id,
            role: message.role,
            parts:
              Array.isArray(message.parts) && message.parts.length > 0
                ? message.parts
                : null,
            content:
              typeof message.content === "string" ? message.content : null,
          };
        }),
        initialResumeOffset: undefined,
      });
      queryClient.setQueryData<ThreadArtifact[]>(
        artifactsByThreadQuery(tid).queryKey,
        [],
      );
    }

    onThreadCreated(tid);
  }, [routeThreadId, onThreadCreated, queryClient]);

  const clientTools = useMemo(() => {
    const collectFormData = collectFormDataTool.client(async () =>
      registerPending<CollectFormDataOutput>("collect_form_data"),
    );
    const resolveDuplicate = resolveDuplicateEntityTool.client(async () =>
      registerPending<ResolutionOutput>("resolve_duplicate_entity"),
    );
    return [collectFormData, resolveDuplicate] as const;
  }, []);

  const connection = useMemo(() => {
    if (!activeThreadId) return noopConnection;
    const encoded = encodeURIComponent(activeThreadId);
    return durableStreamConnection({
      sendUrl: `/api/chat?id=${encoded}`,
      readUrl: `/api/chat-stream?id=${encoded}`,
      initialOffset: initialResumeOffset,
    });
  }, [activeThreadId, initialResumeOffset]);

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: activeThreadId,
    connection,
    live: Boolean(activeThreadId),
    tools: clientTools,
    initialMessages: (initialMessages ?? []) as never,
    body: {
      threadId: resolvedThreadId,
      model,
      temperature,
      systemPrompt,
      selectedServers,
      enabledTools,
    },
    onCustomEvent: (eventType: string, data: unknown) => {
      if (eventType === "thread_created") {
        const { threadId: realId } = data as { threadId: string };
        const optimisticId = pendingThreadCreationIdRef.current ?? undefined;
        pendingThreadCreationIdRef.current = null;
        if (resolvedThreadIdRef.current !== realId) {
          resolvedThreadIdRef.current = realId;
          setResolvedThreadId(realId);
        }
        if (optimisticId) {
          promoteOptimisticToRealThread(queryClient, realId, optimisticId);
        }
      }
      if (eventType === "thread_title_updated") {
        const { threadId, title } = data as {
          threadId?: string;
          title?: string;
        };
        if (!threadId || typeof title !== "string") return;
        setThreadTitle(queryClient, threadId, title);
        queryClient.setQueryData<{
          id: string;
          title: string;
          initialResumeOffset?: string;
          messages: Array<{
            id: string;
            role: string;
            content?: string | null;
            parts?: unknown[] | null;
          }>;
        }>(threadDetailQuery(threadId).queryKey, (old) => {
          if (!old || old.title === title) return old;
          return { ...old, title };
        });
      }
      if (eventType === "persistence_complete") {
        invalidateThreadList(queryClient);
        void navigateIfReady();
      }
      if (TERMINAL_RUN_EVENT_TYPES.has(eventType)) {
        const maybeThreadId = (data as { threadId?: string } | null)?.threadId;
        const targetThreadId =
          maybeThreadId ?? resolvedThreadIdRef.current ?? activeThreadId;
        if (targetThreadId) {
          clearThreadStreaming(targetThreadId);
        }
      }
      if (eventType === "spec_patch" || eventType === "spec_complete") {
        const { spec, specIndex: idx } = data as {
          spec: Spec;
          specIndex: number;
        };
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        if (lastMsg) liveSpecStore.set(lastMsg.id, idx, spec);
      }
    },
    onError: (err: unknown) => {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Chat request failed";

      // The stream transport can emit a transient startup disconnect on page
      // refresh before any user action. Suppress that one noisy banner so the
      // composer only surfaces actionable send errors.
      if (
        errorMessage === "Error in input stream" &&
        !hasUserSubmittedRef.current
      ) {
        return;
      }

      setSubmissionError(errorMessage);
      setIsBootstrappingThread(false);
    },
  });

  useEffect(() => {
    if (!activeThreadId) return;
    const isThreadStreaming = status === "submitted" || status === "streaming";
    if (isThreadStreaming) {
      markThreadStreaming(activeThreadId, "status");
    } else {
      clearThreadStreaming(activeThreadId);
    }
  }, [activeThreadId, status]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const pendingInteractiveTarget = useMemo(
    () => getPendingInteractiveTarget(messages),
    [messages],
  );

  const lastSyncedRouteThreadIdRef = useRef(routeThreadId);
  useLayoutEffect(() => {
    if (!syncOnRouteThreadChange) return;
    if (lastSyncedRouteThreadIdRef.current === routeThreadId) return;
    lastSyncedRouteThreadIdRef.current = routeThreadId;

    stop();
    cancelAllPending("thread-changed");
    setMessages(
      ((initialMessages as ChatMessageShape[] | undefined) ?? []) as never,
    );
    liveSpecStore.clear();

    if (routeThreadId !== undefined) {
      resolvedThreadIdRef.current = routeThreadId;
      setResolvedThreadId(routeThreadId);
    }
    setIsBootstrappingThread(false);
    pendingThreadCreationIdRef.current = null;
    pendingFirstMessageRef.current = null;
    pendingOptimisticUserMessageIdRef.current = null;
    hashScrollTriggeredRef.current = false;
    setOptimisticUserMessage(null);
    clearPendingSidebarInsert();
    navigatedRef.current = false;
  }, [
    clearPendingSidebarInsert,
    routeThreadId,
    initialMessages,
    stop,
    setMessages,
    syncOnRouteThreadChange,
    liveSpecStore,
  ]);

  useEffect(() => {
    return () => {
      clearPendingSidebarInsert();
      cancelAllPending("session-unmount");
    };
  }, [clearPendingSidebarInsert]);
  const clearSubmissionError = useCallback(() => setSubmissionError(null), []);

  const scrollToHashTarget = useCallback(() => {
    if (typeof window === "undefined" || hashScrollTriggeredRef.current)
      return false;
    const hash = window.location.hash;
    if (!hash) return false;
    hashScrollTriggeredRef.current = true;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return true;
  }, []);

  const ensureThreadId = useCallback(
    async (preferredId?: string): Promise<string> => {
      if (resolvedThreadIdRef.current) return resolvedThreadIdRef.current;
      const optimisticId =
        preferredId ??
        pendingThreadCreationIdRef.current ??
        createClientThreadId();
      pendingThreadCreationIdRef.current = optimisticId;
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: optimisticId }),
      });
      if (!response.ok) {
        let detail: string | undefined;
        try {
          const body = (await response.json()) as { message?: string };
          detail = body.message;
        } catch {
          // ignore
        }
        throw new Error(detail ?? `Failed to create chat (${response.status})`);
      }
      const { id } = (await response.json()) as { id: string };
      pendingThreadCreationIdRef.current = null;
      resolvedThreadIdRef.current = id;
      setResolvedThreadId(id);
      promoteOptimisticToRealThread(queryClient, id, optimisticId);
      return id;
    },
    [queryClient],
  );

  useEffect(() => {
    if (!activeThreadId) return;
    const pending = pendingFirstMessageRef.current;
    if (!pending) return;
    pendingFirstMessageRef.current = null;
    const optimisticMessageId =
      pendingOptimisticUserMessageIdRef.current ?? undefined;
    if (pending.kind === "text") {
      if (optimisticMessageId) {
        void sendMessage({
          id: optimisticMessageId,
          content: [{ type: "text", content: pending.value }],
        } as never);
      } else {
        void sendMessage(pending.value as never);
      }
    } else {
      if (optimisticMessageId) {
        void sendMessage({
          id: optimisticMessageId,
          content: pending.content,
        } as never);
      } else {
        void sendMessage({ content: pending.content } as never);
      }
    }
    setIsBootstrappingThread(false);
    // Do NOT call navigateIfReady() here — messages are not yet populated.
    // Navigation happens in the persistence_complete handler once the run
    // is finished and messagesRef.current is fully populated.
  }, [activeThreadId, sendMessage]);

  useEffect(() => {
    if (!optimisticUserMessage) return;
    const hasCommittedOptimisticUserMessage = messages.some(
      (message) =>
        message.role === "user" && message.id === optimisticUserMessage.id,
    );
    if (!hasCommittedOptimisticUserMessage) return;
    pendingOptimisticUserMessageIdRef.current = null;
    setOptimisticUserMessage(null);
  }, [messages, optimisticUserMessage]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const trimmedText = message.text.trim();
      const fileCount = message.files.length;
      if (trimmedText.length === 0 && fileCount === 0) return;

      if (pendingInteractiveTarget) {
        requestAnimationFrame(() => {
          document
            .getElementById(`msg-${pendingInteractiveTarget.messageId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }

      const hasMediaAttachment = message.files.some(
        (file) =>
          file.mediaType?.startsWith("image/") ||
          file.mediaType?.startsWith("audio/") ||
          file.mediaType?.startsWith("video/") ||
          file.mediaType === "application/pdf",
      );
      if (hasMediaAttachment && !isVisionCapableModel(model)) {
        setSubmissionError(
          "Selected model does not support image or document input. Switch to a vision-capable model (e.g. gpt-4o, gpt-5).",
        );
        return;
      }

      setSubmissionError(null);
      hasUserSubmittedRef.current = true;

      let attachments: Awaited<ReturnType<typeof uploadAttachmentSource>>[] =
        [];
      if (fileCount > 0) {
        try {
          attachments = await Promise.all(
            message.files.map((file) =>
              uploadAttachmentSource(
                file.url,
                file.mediaType,
                file.filename ?? "upload",
              ),
            ),
          );
        } catch (err) {
          setSubmissionError(
            err instanceof Error ? err.message : "Attachment upload failed",
          );
          return;
        }
      }

      const normalizedAttachments = attachments.map((attachment) => ({
        url: toAbsoluteAttachmentUrl(attachment.url),
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      }));

      if (
        hasMediaAttachment &&
        normalizedAttachments.some((attachment) =>
          isLocalOrPrivateAttachmentUrl(attachment.url),
        )
      ) {
        setSubmissionError(
          "The selected model runs in Azure and cannot fetch attachments from local/private URLs. Expose your app with a public tunnel (for example cloudflared/ngrok), then retry.",
        );
        return;
      }

      const outgoing: PendingSend =
        attachments.length === 0
          ? { kind: "text", value: trimmedText }
          : {
              kind: "parts",
              content: buildPromptContentParts({
                text: trimmedText,
                attachments: normalizedAttachments,
              }),
            };

      if (resolvedThreadIdRef.current) {
        if (outgoing.kind === "text") {
          void sendMessage(outgoing.value as never);
        } else {
          void sendMessage({ content: outgoing.content } as never);
        }
        return;
      }

      const optimisticThreadId =
        pendingThreadCreationIdRef.current ?? createClientThreadId();
      const optimisticUserMessageId =
        pendingOptimisticUserMessageIdRef.current ?? createClientMessageId();
      setIsBootstrappingThread(true);
      pendingThreadCreationIdRef.current = optimisticThreadId;
      pendingOptimisticUserMessageIdRef.current = optimisticUserMessageId;
      setOptimisticUserMessage(
        toOptimisticUserMessage(optimisticUserMessageId, outgoing),
      );
      scheduleOptimisticSidebarInsert(optimisticThreadId);
      pendingFirstMessageRef.current = outgoing;
      try {
        await ensureThreadId(optimisticThreadId);
      } catch (err) {
        clearPendingSidebarInsert();
        pendingFirstMessageRef.current = null;
        pendingThreadCreationIdRef.current = null;
        pendingOptimisticUserMessageIdRef.current = null;
        setOptimisticUserMessage(null);
        setIsBootstrappingThread(false);
        clearThreadStreaming(optimisticThreadId);
        removeThreadFromList(queryClient, optimisticThreadId);
        setSubmissionError(
          err instanceof Error ? err.message : "Failed to start chat",
        );
      }
    },
    [
      clearPendingSidebarInsert,
      ensureThreadId,
      model,
      pendingInteractiveTarget,
      queryClient,
      scheduleOptimisticSidebarInsert,
      sendMessage,
    ],
  );

  const handleSaveArtifact = useCallback(
    async (spec: Spec, messageId?: string, specIndex = 0) => {
      const root = spec.elements?.[spec.root] as
        | { props?: { title?: string } }
        | undefined;
      const title =
        root?.props?.title || `Chart – ${new Date().toLocaleDateString()}`;

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

  const resolveInteractive = useCallback(
    (toolName: InteractiveToolName, output: unknown) => {
      const resolved = resolvePending(toolName, output);
      if (!resolved && process.env.NODE_ENV !== "production") {
        console.warn(
          `[interactive-tool] resolvePending("${toolName}") had no awaiting handler; ` +
            `this usually means the tool call finished before the UI responded ` +
            `or the session was recreated while a form was open.`,
        );
      }
    },
    [],
  );

  const isStreaming = status !== "ready";
  const lastMessage = messages[messages.length - 1];
  const lastMessageIsUser = lastMessage?.role === "user";
  const hasAssistantContent =
    lastMessage?.role === "assistant" &&
    (lastMessage.parts.length > 0 ||
      (liveSpecStore.getSnapshot().get(lastMessage.id)?.length ?? 0) > 0);

  return {
    messages,
    status,
    stop,
    liveSpecStore,
    savedArtifactKeys,
    handleSubmit,
    handleSaveArtifact,
    resolveInteractive,
    isStreaming,
    isBootstrappingThread,
    optimisticUserMessage,
    hasHashTarget,
    scrollToHashTarget,
    // Prevent "Thinking…" from rendering before the user's first message is
    // visible in the transcript during new-thread bootstrap.
    isAwaitingResponse:
      isStreaming && lastMessageIsUser && !hasAssistantContent,
    submissionError,
    clearSubmissionError,
  };
}
