import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import {
  confirmPendingV2Thread,
  discardPendingV2Thread,
  insertPendingV2Thread,
  refetchV2ThreadCollections,
  setV2ThreadStreamingState,
  setV2ThreadTitle,
} from "../data/mutations";
import type { V2RuntimeMessage } from "../server/runtime-message";
import { V2Composer } from "./v2-composer";

type RuntimeTextPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "text" }
>;

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
    status,
    stop,
    error,
    setMessages,
  } = useChat({
    id: threadId,
    connection,
    live: true,
    initialMessages,
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
        void refetchV2ThreadCollections(queryClient);
      }
    },
    onError: () => {
      // Reset optimistic streaming indicator immediately on transport/model failures.
      void setV2ThreadStreamingState(queryClient, threadId, false);
    },
  });
  const previousThreadIdRef = useRef(threadId);

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) return;
    previousThreadIdRef.current = threadId;

    // Keep the runtime aligned with Router thread identity changes.
    stop();
    setMessages(initialMessages);
    setCreationError(null);
  }, [initialMessages, setMessages, stop, threadId]);

  useEffect(() => {
    if (isDraftThread && status === "ready") {
      return;
    }
    const isStreaming = status === "submitted" || status === "streaming";
    void setV2ThreadStreamingState(queryClient, threadId, isStreaming);
  }, [isDraftThread, queryClient, status, threadId]);

  const displayMessages = runtimeMessages as Array<V2RuntimeMessage>;
  const isStreaming = status === "submitted" || status === "streaming";
  const submissionError = creationError ?? error?.message ?? null;

  async function ensureDraftThreadReady(): Promise<void> {
    if (!isDraftThread) return;

    setCreationError(null);
    insertPendingV2Thread(queryClient, threadId);

    try {
      await confirmPendingV2Thread(queryClient, threadId);
      await refetchV2ThreadCollections(queryClient);
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3">
          {runtimeMessages.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              Start the conversation by sending a message.
            </div>
          ) : null}

          {displayMessages.map((message) => {
            const renderText =
              message.renderText ??
              message.parts
                .filter((part): part is RuntimeTextPart => part.type === "text")
                .map((part) => part.content)
                .join("\n")
                .trim();

            return (
              <div
                key={message.id}
                className={[
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                ].join(" ")}
              >
                <div className="mb-1 text-[10px] tracking-wide uppercase opacity-70">
                  {message.role}
                </div>
                <div className="break-words whitespace-pre-wrap">
                  {renderText}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <V2Composer
        isStreaming={isStreaming}
        onStop={stop}
        onSubmit={async (text) => {
          try {
            await ensureDraftThreadReady();
            setCreationError(null);
            await sendMessage(text);
          } catch {
            return;
          }
        }}
      />
    </div>
  );
}
