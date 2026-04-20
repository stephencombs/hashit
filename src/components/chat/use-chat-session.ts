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
import type { PromptInputMessage } from "~/components/ai-elements/prompt-input";
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
import {
  attachmentResponseSchema,
  type AttachmentResponse,
} from "~/lib/attachment-schemas";
import {
  buildPromptContentParts,
  isVisionCapableModel,
} from "~/lib/multimodal-parts";
import { collectFormDataTool, type CollectFormDataOutput } from "~/lib/form-tool";
import {
  resolveDuplicateEntityTool,
  type ResolutionOutput,
} from "~/lib/resolve-duplicate-tool";
import {
  cancelAllPending,
  INTERACTIVE_TOOL_NAMES,
  isInteractiveToolName,
  registerPending,
  resolvePending,
  type InteractiveToolName,
} from "~/lib/interactive-tool-registry";

export type ChatMessageShape = {
  id: string;
  role: "user" | "assistant";
  parts: Array<MessagePart>;
};

/**
 * Finds the most recent assistant turn whose interactive tool-call is not
 * yet resolved. The composer uses this to block sending new user messages
 * until the user has responded to the form / resolution card.
 */
function getPendingInteractiveTarget(
  messages: Array<{ id: string; role: string; parts: Array<MessagePart> }>,
): { messageId: string; toolCallId: string; toolName: InteractiveToolName } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

    let latestPending:
      | { toolCallId: string; toolName: InteractiveToolName }
      | null = null;
    for (const part of message.parts) {
      if ((part as { type?: string }).type !== "tool-call") continue;
      const toolCall = part as {
        id?: string;
        name?: string;
        output?: unknown;
      };
      // TanStack AI client-tools leave state at "input-complete" even after
      // resolution; presence of `output` is the reliable completion signal.
      if (
        typeof toolCall.name === "string" &&
        isInteractiveToolName(toolCall.name) &&
        typeof toolCall.id === "string" &&
        toolCall.output === undefined
      ) {
        latestPending = {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        };
      }
    }

    if (!latestPending) {
      return null;
    }

    return {
      messageId: message.id,
      toolCallId: latestPending.toolCallId,
      toolName: latestPending.toolName,
    };
  }

  return null;
}

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
   * swap messages, clear live specs — without remounting.
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

async function uploadAttachmentSource(
  url: string,
  mediaType: string,
  filename: string,
): Promise<AttachmentResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read attachment source (${response.status})`);
  }
  const blob = await response.blob();
  const file = new File([blob], filename || "upload", {
    type: mediaType || blob.type || "application/octet-stream",
  });

  const formData = new FormData();
  formData.append("file", file);

  const uploadResponse = await fetch("/api/prompt-attachments", {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    let detail: string | undefined;
    try {
      const body = (await uploadResponse.json()) as {
        message?: string;
        why?: string;
      };
      detail = body.message ?? body.why;
    } catch {
      // ignore
    }
    throw new Error(detail ?? `Upload failed (${uploadResponse.status})`);
  }

  const json = await uploadResponse.json();
  return attachmentResponseSchema.parse(json);
}

function toAbsoluteAttachmentUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function isLocalOrPrivateAttachmentUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }
  if (hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }

  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) {
      return true;
    }
  }

  return false;
}

/**
 * Shared TanStack AI chat wiring: SSE, custom events, resolved thread id for
 * new-chat flows, live spec store, thread-list cache updates, and client
 * tools for the interactive HITL flow (collect_form_data,
 * resolve_duplicate_entity).
 *
 * The client tool handlers park on a promise from the interactive-tool
 * registry; the UI resolves it when the user submits. TanStack AI's runtime
 * pauses the agent loop on that await, writes the tool-call part with
 * `state: "result"` + `output: <submitted data>` when it settles, and
 * auto-continues via `checkForContinuation`. No custom stream-stopping or
 * `addToolResult` plumbing is needed.
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

  // Client tool handlers. Each one awaits a promise registered in the
  // interactive-tool registry; the UI resolves it when the user submits.
  // TanStack AI's runtime blocks the agent loop on that await and persists
  // the result into the tool-call part automatically.
  const clientTools = useMemo(() => {
    const collectFormData = collectFormDataTool.client(async () =>
      registerPending<CollectFormDataOutput>("collect_form_data"),
    );
    const resolveDuplicate = resolveDuplicateEntityTool.client(async () =>
      registerPending<ResolutionOutput>("resolve_duplicate_entity"),
    );
    return [collectFormData, resolveDuplicate] as const;
  }, []);

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: routeThreadId,
    connection: fetchServerSentEvents("/api/chat"),
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
    // Abandon any in-flight interactive handlers so their .client() promises
    // reject cleanly instead of resolving against the new thread.
    cancelAllPending("thread-changed");

    const incoming = (initialMessages as ChatMessageShape[] | undefined) ?? [];
    setMessages(incoming as never);
    liveSpecStore.clear();

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

  // Cancel any awaiting .client() promise if the session unmounts so the
  // runtime error-reports the unresolved tool call instead of hanging.
  useEffect(() => {
    return () => {
      cancelAllPending("session-unmount");
    };
  }, []);

  useScrollToHashOnMount();

  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const clearSubmissionError = useCallback(() => setSubmissionError(null), []);

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

      let attachments: AttachmentResponse[] = [];
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

      const now = new Date();
      if (!resolvedThreadId) {
        insertOptimisticThread(queryClient, now);
      }

      if (attachments.length === 0) {
        sendMessage(trimmedText);
        return;
      }

      const normalizedAttachments = attachments.map((a) => ({
        url: toAbsoluteAttachmentUrl(a.url),
        mimeType: a.mimeType,
        filename: a.filename,
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

      const contentParts = buildPromptContentParts({
        text: trimmedText,
        attachments: normalizedAttachments,
      });

      sendMessage({ content: contentParts });
    },
    [pendingInteractiveTarget, resolvedThreadId, queryClient, sendMessage, model],
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

  /**
   * Single callback the UI invokes when the user submits a form or picks a
   * resolution action. Resolves the parked `.client()` promise for the
   * given tool; TanStack AI's runtime then writes the tool-call part with
   * `state: "result"` + `output` and POSTs a continuation automatically.
   */
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
    setMessages,
    stop,
    liveSpecStore,
    savedArtifactKeys,
    handleSubmit,
    handleSaveArtifact,
    resolveInteractive,
    pendingInteractiveTarget,
    isStreaming,
    isAwaitingResponse,
    submissionError,
    clearSubmissionError,
  };
}

export { INTERACTIVE_TOOL_NAMES } from "~/lib/interactive-tool-registry";
