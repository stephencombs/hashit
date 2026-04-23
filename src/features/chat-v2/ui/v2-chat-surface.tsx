import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Spec } from "@json-render/core";
import { CopyIcon, RotateCcwIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChatConversation } from "~/components/chat/chat-conversation";
import {
  MessageAction,
  MessageActions,
  Message,
  MessageContent,
  MessageResponse,
} from "~/components/ai-elements/message";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { LiveSpecStore, useLiveSpecsSnapshot } from "~/lib/live-spec-store";
import {
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

const JsonRenderDisplay = lazy(() =>
  import("~/components/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

type RuntimeUiSpecPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "ui-spec" }
>;

function getMessageFromRole(role: V2RuntimeMessage["role"]): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function copyMessageText(text: string): void {
  if (!text.trim()) return;
  void navigator.clipboard.writeText(text).catch(() => {});
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
  const shouldPromoteOnStreamStartRef = useRef(false);
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
    error,
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
    onError: () => {
      shouldPromoteOnStreamStartRef.current = false;
      // Reset optimistic streaming indicator immediately on transport/model failures.
      void setV2ThreadStreamingState(queryClient, threadId, false);
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
    shouldPromoteOnStreamStartRef.current = false;
    stop();
    setMessages(initialMessages as never);
    liveSpecStore.clear();
    setCreationError(null);
  }, [initialMessages, liveSpecStore, setMessages, stop, threadId]);

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
  const submissionError = creationError ?? error?.message ?? null;
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
      return {
        isLatestAssistant: message.id === lastAssistantMessageId,
        liveSpecs,
        message,
        persistedSpecs,
        renderText: message.renderText.trim(),
        shouldShowLiveSpecs: persistedSpecs.length === 0 && Boolean(liveSpecs),
      };
    });
  }, [displayMessages, liveSpecsByMessageId]);

  async function ensureDraftThreadReady(): Promise<void> {
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
  }

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
              <MessageContent>
                {renderText.length > 0 ? <MessageResponse>{renderText}</MessageResponse> : null}
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
                  label="Copy message"
                  onClick={() => copyMessageText(renderText)}
                  tooltip="Copy message"
                >
                  <CopyIcon />
                </MessageAction>
                {message.role === "assistant" && isLatestAssistant ? (
                  <MessageAction
                    disabled={isStreaming}
                    label="Regenerate response"
                    onClick={() => {
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
        onSubmit={async (text) => {
          try {
            await ensureDraftThreadReady();
            setCreationError(null);
            shouldPromoteOnStreamStartRef.current = true;
            await sendMessage(text);
          } catch {
            shouldPromoteOnStreamStartRef.current = false;
            return;
          }
        }}
      />
    </div>
  );
}
