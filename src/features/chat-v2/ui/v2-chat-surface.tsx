import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Spec } from "@json-render/core";
import { CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { motion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatConversation } from "~/components/chat/chat-conversation";
import {
  MessageAction,
  MessageActions,
  Message,
  MessageContent,
  MessageResponse,
} from "~/components/ai-elements/message";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "~/components/ai-elements/attachments";
import type { PromptInputMessage } from "~/components/ai-elements/prompt-input";
import {
  isRenderableAttachmentPart,
  toAttachmentData,
} from "~/components/chat/message-row-parts";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { LiveSpecStore, useLiveSpecsSnapshot } from "~/lib/live-spec-store";
import { buildPromptContentParts } from "~/lib/multimodal-parts";
import {
  v2ThreadAttachmentSummaryQueryOptions,
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "../data/query-options";
import {
  confirmPendingV2Thread,
  discardPendingV2Thread,
  insertPendingV2Thread,
  setV2ThreadStreamingState,
  setV2ThreadTitle,
} from "../data/mutations";
import type { V2RuntimeMessage } from "../server/runtime-message";
import { V2Composer } from "./v2-composer";
import {
  toAbsoluteAttachmentUrl,
  uploadV2AttachmentSource,
} from "./v2-session-attachments";

const JsonRenderDisplay = lazy(() =>
  import("~/components/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

type RuntimeUiSpecPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "ui-spec" }
>;
type RuntimeAttachmentPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "image" | "audio" | "video" | "document" }
>;

function getMessageFromRole(role: V2RuntimeMessage["role"]): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Chat request failed";
}

function isAbortLikeError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("aborted") ||
    normalized.includes("aborterror") ||
    normalized.includes("request was aborted")
  );
}

function resolveRenderText(message: V2RuntimeMessage): string {
  if (typeof message.renderText === "string") {
    return message.renderText.trim();
  }

  const textParts: string[] = [];
  for (const part of message.parts) {
    if (part.type !== "text") continue;
    textParts.push(part.content);
  }
  return textParts.join("\n").trim();
}

export function mergeBackfilledMessages(params: {
  olderMessages: Array<V2RuntimeMessage>;
  currentMessages: Array<V2RuntimeMessage>;
}): Array<V2RuntimeMessage> {
  const currentIds = new Set(params.currentMessages.map((message) => message.id));
  const missingOlder = params.olderMessages.filter(
    (message) => !currentIds.has(message.id),
  );
  if (missingOlder.length === 0) return params.currentMessages;
  return [...missingOlder, ...params.currentMessages];
}

type InitialSnapMode = "aggressive" | "minimal";

export function resolveV2InitialSnapMode(params: {
  isDraftThread: boolean;
  initialMessageCount: number;
  enableInitialTranscriptRender: boolean;
}): InitialSnapMode {
  if (params.isDraftThread) return "aggressive";
  if (params.enableInitialTranscriptRender) return "minimal";
  if (params.initialMessageCount > 0) return "minimal";
  return "aggressive";
}

export function resolveV2TranscriptLayerState(params: {
  enableInitialTranscriptRender: boolean;
  hasInitialTranscriptRenderable: boolean;
  isDraftThread: boolean;
  surfaceReady: boolean;
}): {
  shouldRenderInitialTranscript: boolean;
  shouldShowServerTranscriptLayer: boolean;
  shouldHideClientTranscriptLayer: boolean;
} {
  const shouldRenderInitialTranscript =
    params.enableInitialTranscriptRender &&
    params.hasInitialTranscriptRenderable &&
    !params.isDraftThread;
  const shouldShowServerTranscriptLayer =
    shouldRenderInitialTranscript && !params.surfaceReady;

  return {
    shouldRenderInitialTranscript,
    shouldShowServerTranscriptLayer,
    shouldHideClientTranscriptLayer: shouldShowServerTranscriptLayer,
  };
}

export function hasV2ComposerPayload(message: PromptInputMessage): boolean {
  return message.text.trim().length > 0 || message.files.length > 0;
}

type V2ChatSurfaceProps = {
  threadId: string;
  initialResumeOffset?: string;
  initialMessages: Array<V2RuntimeMessage>;
  isDraftThread?: boolean;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

export function V2ChatSurface({
  threadId,
  initialResumeOffset,
  initialMessages,
  isDraftThread = false,
  onThreadReady,
}: V2ChatSurfaceProps) {
  const queryClient = useQueryClient();
  const [creationError, setCreationError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const shouldPromoteOnStreamStartRef = useRef(false);
  const suppressAbortErrorRef = useRef(false);
  const suppressAbortResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveSpecStore] = useState(() => new LiveSpecStore());
  const liveSpecsByMessageId = useLiveSpecsSnapshot(liveSpecStore);

  const connection = useMemo(() => {
    const encodedThreadId = encodeURIComponent(threadId);
    return durableStreamConnection({
      sendUrl: `/api/v2/chat?id=${encodedThreadId}`,
      readUrl: `/api/v2/chat-stream?id=${encodedThreadId}`,
      initialOffset: initialResumeOffset,
    });
  }, [initialResumeOffset, threadId]);

  const {
    messages: runtimeMessages,
    sendMessage,
    reload,
    status,
    stop,
    setMessages,
  } = useChat({
    id: threadId,
    connection,
    live: true,
    // useChat's default part union does not include V2 custom ui-spec parts.
    initialMessages: initialMessages as never,
    body: {
      threadId,
      source: "v2-chat",
    },
    onCustomEvent: (eventType: string, data: unknown) => {
      if (eventType === "thread_title_updated") {
        const payload = data as { threadId?: string; title?: string };
        if (payload.threadId && typeof payload.title === "string") {
          void setV2ThreadTitle(queryClient, payload.threadId, payload.title);
        }
      }

      if (eventType === "persistence_complete") {
        void queryClient.invalidateQueries({
          queryKey: v2ThreadSessionQueryOptions(threadId).queryKey,
          exact: true,
        });
        void queryClient.invalidateQueries({
          queryKey: v2ThreadMessagesQueryOptions(threadId).queryKey,
          exact: true,
        });
        void queryClient.invalidateQueries({
          queryKey: v2ThreadAttachmentSummaryQueryOptions(threadId).queryKey,
          exact: true,
        });
      }
      if (eventType === "spec_patch" || eventType === "spec_complete") {
        const payload = data as { spec?: unknown; specIndex?: unknown };
        if (
          typeof payload.specIndex !== "number" ||
          payload.spec == null ||
          typeof payload.spec !== "object"
        ) {
          return;
        }
        const latestAssistant = [...runtimeMessagesRef.current]
          .reverse()
          .find((message) => message.role === "assistant");
        if (!latestAssistant) return;
        liveSpecStore.set(
          latestAssistant.id,
          payload.specIndex,
          payload.spec as unknown as Spec,
        );
      }
    },
    onError: (chatError: unknown) => {
      shouldPromoteOnStreamStartRef.current = false;
      // Reset optimistic streaming indicator immediately on transport/model failures.
      void setV2ThreadStreamingState(queryClient, threadId, false);
      const message = toErrorMessage(chatError);
      if (isAbortLikeError(message)) {
        if (suppressAbortErrorRef.current) {
          suppressAbortErrorRef.current = false;
        }
        return;
      }
      suppressAbortErrorRef.current = false;
      setRuntimeError(message);
    },
  });
  const previousThreadIdRef = useRef(threadId);
  const runtimeMessagesRef = useRef<Array<V2RuntimeMessage>>(initialMessages);

  useEffect(() => {
    runtimeMessagesRef.current = runtimeMessages as Array<V2RuntimeMessage>;
  }, [runtimeMessages]);

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) return;
    previousThreadIdRef.current = threadId;

    // Keep the runtime aligned with Router thread identity changes.
    suppressAbortErrorRef.current = true;
    if (suppressAbortResetTimeoutRef.current) {
      clearTimeout(suppressAbortResetTimeoutRef.current);
    }
    suppressAbortResetTimeoutRef.current = setTimeout(() => {
      suppressAbortErrorRef.current = false;
      suppressAbortResetTimeoutRef.current = null;
    }, 2_000);
    shouldPromoteOnStreamStartRef.current = false;
    stop();
    setMessages(initialMessages as never);
    liveSpecStore.clear();
    setCopiedMessageId(null);
    setCreationError(null);
    setRuntimeError(null);
  }, [initialMessages, liveSpecStore, setMessages, stop, threadId]);

  useEffect(() => {
    return () => {
      if (suppressAbortResetTimeoutRef.current) {
        clearTimeout(suppressAbortResetTimeoutRef.current);
      }
      if (copiedResetTimeoutRef.current) {
        clearTimeout(copiedResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isDraftThread && status === "ready") {
      return;
    }
    const isStreaming = status === "submitted" || status === "streaming";
    if (isStreaming) {
      if (!shouldPromoteOnStreamStartRef.current) {
        return;
      }
      void setV2ThreadStreamingState(queryClient, threadId, true);
      return;
    }

    shouldPromoteOnStreamStartRef.current = false;
    void setV2ThreadStreamingState(queryClient, threadId, false);
  }, [isDraftThread, queryClient, status, threadId]);

  const displayMessages = runtimeMessages as Array<V2RuntimeMessage>;
  const isStreaming = status === "submitted" || status === "streaming";
  const submissionError = creationError ?? runtimeError;
  const renderedMessages = useMemo(() => {
    let lastAssistantMessageId: string | undefined;
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const message = displayMessages[i];
      if (message.role === "assistant") {
        lastAssistantMessageId = message.id;
        break;
      }
    }

    return displayMessages.map((message) => {
      const persistedSpecs = message.parts
        .filter((part): part is RuntimeUiSpecPart => part.type === "ui-spec")
        .sort((left, right) => left.specIndex - right.specIndex);
      const liveSpecs = liveSpecsByMessageId.get(message.id);
      const attachments = message.parts
        .map((part, index) => ({ part, index }))
        .filter(
          (
            item,
          ): item is {
            part: RuntimeAttachmentPart;
            index: number;
          } => isRenderableAttachmentPart(item.part),
        )
        .map(({ part, index }) =>
          toAttachmentData(part, `${message.id}:attachment:${index}`),
        );
      return {
        attachments,
        isLatestAssistant: message.id === lastAssistantMessageId,
        liveSpecs,
        message,
        persistedSpecs,
        renderText: resolveRenderText(message),
        shouldShowLiveSpecs: persistedSpecs.length === 0 && Boolean(liveSpecs),
      };
    });
  }, [displayMessages, liveSpecsByMessageId]);

  const ensureDraftThreadReady = useCallback(async (): Promise<void> => {
    if (!isDraftThread) return;

    setCreationError(null);
    insertPendingV2Thread(queryClient, threadId);

    try {
      await confirmPendingV2Thread(queryClient, threadId);
      await onThreadReady?.(threadId);
    } catch (error) {
      discardPendingV2Thread(queryClient, threadId);
      setCreationError((error as Error).message);
      throw error;
    }
  }, [isDraftThread, onThreadReady, queryClient, threadId]);

  const handleComposerSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!hasV2ComposerPayload(message)) return;
      const trimmedText = message.text.trim();
      const fileCount = message.files.length;

      try {
        await ensureDraftThreadReady();
      } catch {
        shouldPromoteOnStreamStartRef.current = false;
        return;
      }

      setCreationError(null);
      setRuntimeError(null);
      let attachments: Awaited<ReturnType<typeof uploadV2AttachmentSource>>[] = [];
      if (fileCount > 0) {
        try {
          attachments = await Promise.all(
            message.files.map((file) =>
              uploadV2AttachmentSource({
                threadId,
                url: file.url,
                mediaType: file.mediaType,
                filename: file.filename ?? "upload",
              }),
            ),
          );
        } catch (error) {
          shouldPromoteOnStreamStartRef.current = false;
          setRuntimeError(toErrorMessage(error));
          return;
        }
      }

      shouldPromoteOnStreamStartRef.current = true;
      if (attachments.length === 0) {
        await sendMessage(trimmedText);
        return;
      }

      const outgoingContent = buildPromptContentParts({
        text: trimmedText,
        attachments: attachments.map((attachment) => ({
          url: toAbsoluteAttachmentUrl(attachment.url),
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        })),
      });
      await sendMessage({ content: outgoingContent } as never);
    },
    [ensureDraftThreadReady, sendMessage, threadId],
  );

  const handleCopyMessage = useCallback((messageId: string, text: string) => {
    if (!text.trim()) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedMessageId(messageId);
        if (copiedResetTimeoutRef.current) {
          clearTimeout(copiedResetTimeoutRef.current);
        }
        copiedResetTimeoutRef.current = setTimeout(() => {
          setCopiedMessageId((current) => (current === messageId ? null : current));
          copiedResetTimeoutRef.current = null;
        }, 1_400);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {submissionError ? (
        <div className="border-b p-3">
          <Alert variant="destructive">
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ChatConversation className="min-h-0 flex-1">
        {renderedMessages.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Start the conversation by sending a message.
          </div>
        ) : null}

        {renderedMessages.map(
          ({
            attachments,
            isLatestAssistant,
            liveSpecs,
            message,
            persistedSpecs,
            renderText,
            shouldShowLiveSpecs,
          }) => (
            <Message
              key={message.id}
              from={getMessageFromRole(message.role)}
              id={`msg-${message.id}`}
            >
              {message.role === "user" && attachments.length > 0 ? (
                <Attachments variant="grid" className="group-[.is-user]:ml-auto">
                  {attachments.map((attachment) => (
                    <Attachment key={attachment.id} data={attachment}>
                      <AttachmentPreview />
                      <AttachmentInfo />
                    </Attachment>
                  ))}
                </Attachments>
              ) : null}
              <MessageContent>
                {renderText.length > 0 ? <MessageResponse>{renderText}</MessageResponse> : null}
                {message.role !== "user" && attachments.length > 0 ? (
                  <Attachments variant="grid">
                    {attachments.map((attachment) => (
                      <Attachment key={attachment.id} data={attachment}>
                        <AttachmentPreview />
                        <AttachmentInfo />
                      </Attachment>
                    ))}
                  </Attachments>
                ) : null}
                {persistedSpecs.map((part) => (
                  <Suspense key={`${message.id}:persisted:${part.specIndex}`} fallback={null}>
                    <JsonRenderDisplay
                      spec={part.spec as Spec}
                      isStreaming={false}
                      messageId={message.id}
                      specIndex={part.specIndex}
                    />
                  </Suspense>
                ))}
                {shouldShowLiveSpecs
                  ? liveSpecs?.map((spec, index) => (
                      <Suspense key={`${message.id}:live:${index}`} fallback={null}>
                        <JsonRenderDisplay
                          spec={spec}
                          isStreaming={isStreaming && isLatestAssistant}
                          messageId={message.id}
                          specIndex={index}
                        />
                      </Suspense>
                    ))
                  : null}
              </MessageContent>
              <MessageActions>
                <MessageAction
                  label={copiedMessageId === message.id ? "Copied" : "Copy message"}
                  onClick={() => handleCopyMessage(message.id, renderText)}
                  tooltip={copiedMessageId === message.id ? "Copied" : "Copy message"}
                >
                  <span className="relative block size-4">
                    <motion.span
                      animate={{
                        filter:
                          copiedMessageId === message.id ? "blur(4px)" : "blur(0px)",
                        opacity: copiedMessageId === message.id ? 0 : 1,
                        scale: copiedMessageId === message.id ? 0.25 : 1,
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <CopyIcon />
                    </motion.span>
                    <motion.span
                      animate={{
                        filter:
                          copiedMessageId === message.id ? "blur(0px)" : "blur(4px)",
                        opacity: copiedMessageId === message.id ? 1 : 0,
                        scale: copiedMessageId === message.id ? 1 : 0.25,
                      }}
                      className="absolute inset-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <CheckIcon />
                    </motion.span>
                  </span>
                </MessageAction>
                {message.role === "assistant" && isLatestAssistant ? (
                  <MessageAction
                    disabled={isStreaming}
                    label="Regenerate response"
                    onClick={() => {
                      setRuntimeError(null);
                      shouldPromoteOnStreamStartRef.current = true;
                      void reload().catch(() => {});
                    }}
                    tooltip="Regenerate response"
                  >
                    <RotateCcwIcon />
                  </MessageAction>
                ) : null}
              </MessageActions>
            </Message>
          ),
        )}
      </ChatConversation>

      <V2Composer
        isStreaming={isStreaming}
        onStop={stop}
        onSubmit={handleComposerSubmit}
      />
    </div>
  );
}
