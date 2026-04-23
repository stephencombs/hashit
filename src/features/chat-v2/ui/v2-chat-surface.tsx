import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import type { V2Message } from "../types";
import {
  confirmPendingV2Thread,
  discardPendingV2Thread,
  insertPendingV2Thread,
  refetchV2ThreadCollections,
  setV2ThreadStreamingState,
  setV2ThreadTitle,
} from "../data/mutations";
import { V2Composer } from "./v2-composer";

type V2ChatSurfaceProps = {
  threadId: string;
  initialResumeOffset?: string;
  initialMessages: Array<V2Message>;
  isDraftThread?: boolean;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

type RuntimeRole = "system" | "user" | "assistant" | "tool";

function toRuntimeRole(role: string): RuntimeRole {
  if (role === "system" || role === "user" || role === "assistant" || role === "tool") {
    return role;
  }
  return "assistant";
}

function toRuntimeMessages(messages: Array<V2Message>): Array<UIMessage> {
  return messages.map((message) => ({
    id: message.id,
    role: toRuntimeRole(message.role),
    parts:
      Array.isArray(message.parts) && message.parts.length > 0
        ? (message.parts as UIMessage["parts"])
        : [{ type: "text", content: message.content }],
  }));
}

function extractTextPart(part: unknown): string {
  if (!part || typeof part !== "object") return "";
  const value = part as { type?: unknown; content?: unknown };
  if (value.type !== "text") return "";
  return typeof value.content === "string" ? value.content : "";
}

function getRenderableRuntimeMessageText(message: UIMessage): string {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    const fromParts = message.parts
      .map((part) => extractTextPart(part))
      .filter((value) => value.length > 0)
      .join("\n")
      .trim();
    if (fromParts.length > 0) return fromParts;
  }
  const fallbackContent = (message as { content?: unknown }).content;
  return typeof fallbackContent === "string" ? fallbackContent : "";
}

function formatSubmissionError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Chat request failed";
}

function deriveThreadTitleFromFirstMessage(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  let title = normalized.split(" ").slice(0, 6).join(" ");
  if (title.length > 64) {
    title = title.slice(0, 64).trimEnd();
  }
  return title || undefined;
}

export function V2ChatSurface({
  threadId,
  initialResumeOffset,
  initialMessages,
  isDraftThread = false,
  onThreadReady,
}: V2ChatSurfaceProps) {
  const queryClient = useQueryClient();
  const [creationError, setCreationError] = useState<string | null>(null);
  const initialRuntimeMessages = useMemo(
    () => toRuntimeMessages(initialMessages),
    [initialMessages],
  );

  const connection = useMemo(() => {
    const encodedThreadId = encodeURIComponent(threadId);
    return durableStreamConnection({
      sendUrl: `/api/v2/chat?id=${encodedThreadId}`,
      readUrl: `/api/v2/chat-stream?id=${encodedThreadId}`,
      initialOffset: initialResumeOffset,
    });
  }, [initialResumeOffset, threadId]);

  const { messages: runtimeMessages, sendMessage, status, stop, error, setMessages } = useChat({
    id: threadId,
    connection,
    live: true,
    initialMessages: initialRuntimeMessages as never,
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
    setMessages(initialRuntimeMessages as never);
    setCreationError(null);
  }, [initialRuntimeMessages, setMessages, stop, threadId]);

  useEffect(() => {
    if (isDraftThread && status === "ready") {
      return;
    }
    const isStreaming = status === "submitted" || status === "streaming";
    void setV2ThreadStreamingState(queryClient, threadId, isStreaming);
  }, [isDraftThread, queryClient, status, threadId]);

  const isStreaming = status === "submitted" || status === "streaming";
  const submissionError =
    creationError ?? (error ? formatSubmissionError(error) : null);

  async function ensureDraftThreadReady(firstMessage: string): Promise<void> {
    if (!isDraftThread) return;

    setCreationError(null);
    insertPendingV2Thread(queryClient, threadId);
    const derivedTitle = deriveThreadTitleFromFirstMessage(firstMessage);

    try {
      await confirmPendingV2Thread(queryClient, threadId, derivedTitle);
      await refetchV2ThreadCollections(queryClient);
      await onThreadReady?.(threadId);
    } catch (error) {
      discardPendingV2Thread(queryClient, threadId);
      setCreationError(formatSubmissionError(error));
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
            <div className="text-sm text-muted-foreground">
              Start the conversation by sending a message.
            </div>
          ) : null}

          {runtimeMessages.map((message) => (
            <div
              key={message.id}
              className={[
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              ].join(" ")}
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                {message.role}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {getRenderableRuntimeMessageText(message)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <V2Composer
        isStreaming={isStreaming}
        onStop={stop}
        onSubmit={async (text) => {
          try {
            await ensureDraftThreadReady(text);
            setCreationError(null);
            await sendMessage(text as never);
          } catch {
            return;
          }
        }}
      />
    </div>
  );
}
