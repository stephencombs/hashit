import type { ChatStatus } from "ai";
import { useCallback, useEffect, useState } from "react";
import { ChatComposer } from "~/components/chat/chat-composer";
import { ChatConversation } from "~/components/chat/chat-conversation";
import { ChatEmptyState } from "~/components/chat/chat-empty-state";
import { ChatMessageList } from "~/components/chat/chat-message-list";
import type { ChatMessageShape } from "~/components/chat/chat-session-types";
import { useChatRuntime } from "~/components/chat/use-chat-runtime";
import type { ChatMessage } from "~/components/chat/message-row";

export interface ChatProps {
  /** Existing thread to attach to. Omit for a new-chat surface. */
  threadId?: string;
  /** Server-rendered messages to hydrate before the live stream resumes. */
  initialMessages?: Array<ChatMessageShape>;
  /**
   * Opaque offset returned by `materializeSnapshotFromDurableStream`. Resumes
   * the durable stream where the SSR snapshot left off.
   */
  initialResumeOffset?: string;
  /** Called once a brand-new thread has been created server-side. */
  onThreadCreated?: (threadId: string) => void;
}

/**
 * Standalone chat surface.
 *
 * Layout contract (single source of truth — no per-route divergence):
 *
 *   ┌─ flex column, min-h-0 ─────────────────────────────────────┐
 *   │  ChatConversation        flex-1, scrollbar at screen edge   │
 *   │    └─ centered max-w-720 column with messages               │
 *   │       (or ChatEmptyState when there are no messages yet)    │
 *   │                                                             │
 *   │  ChatComposer            shrink-0, max-w-720 dock           │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Autoscroll is handled by `use-stick-to-bottom` (via ai-elements'
 * `Conversation`) which is ResizeObserver-backed, so late layout from
 * charts, web fonts, and image decoding always pins to the true bottom
 * — no virtualization, no `requestAnimationFrame` chains, no manual
 * `scrollTop` math.
 *
 * Render-locality:
 * - `ChatComposer` is memoized and owns its own input string; typing never
 *   re-renders the message list.
 * - `ChatMessageList` subscribes to the live-spec store via
 *   `useSyncExternalStore`, so streaming `spec_patch` events only re-render
 *   the list itself — not the composer or this shell.
 * - `MessageRow` is memoized per message, so historical rows skip work
 *   when the streaming row updates.
 */
export function Chat({
  threadId,
  initialMessages,
  initialResumeOffset,
  onThreadCreated,
}: ChatProps) {
  const session = useChatRuntime({
    threadId,
    initialMessages,
    initialResumeOffset,
    onThreadCreated,
    cancelQueriesOnUnmount: true,
  });

  const hasCommittedUserMessage = session.messages.some(
    (message) => message.role === "user",
  );
  const displayedMessages = !hasCommittedUserMessage && session.optimisticUserMessage
    ? [...session.messages, session.optimisticUserMessage]
    : session.messages;
  const hasMessages = displayedMessages.length > 0;
  const showConversation =
    hasMessages || session.isStreaming || session.isBootstrappingThread;
  const surfaceKey = threadId ?? "__new-chat__";
  const [surfaceReady, setSurfaceReady] = useState(!showConversation);
  const [conversationReady, setConversationReady] = useState(false);
  const [pendingBottomSpecs, setPendingBottomSpecs] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setConversationReady(false);
    setPendingBottomSpecs(new Set());
    setSurfaceReady(!showConversation);
  }, [surfaceKey, showConversation]);

  const handleConversationReady = useCallback(() => {
    setConversationReady(true);
  }, []);

  const handleBottomSpecPendingChange = useCallback(
    (specKey: string, pending: boolean) => {
      setPendingBottomSpecs((prev) => {
        const hasKey = prev.has(specKey);
        if (pending && hasKey) return prev;
        if (!pending && !hasKey) return prev;
        const next = new Set(prev);
        if (pending) {
          next.add(specKey);
        } else {
          next.delete(specKey);
        }
        return next;
      });
    },
    [],
  );

  const bottomSpecsReady = pendingBottomSpecs.size === 0;

  useEffect(() => {
    if (!showConversation || surfaceReady) return;
    if (!conversationReady || !bottomSpecsReady) return;
    setSurfaceReady(true);
  }, [bottomSpecsReady, conversationReady, showConversation, surfaceReady]);

  useEffect(() => {
    if (!showConversation || surfaceReady) return;
    const timeoutId = window.setTimeout(() => {
      setSurfaceReady(true);
    }, 2_500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showConversation, surfaceReady]);

  useEffect(() => {
    if (!surfaceReady || !showConversation || !session.hasHashTarget) return;
    session.scrollToHashTarget();
  }, [session, showConversation, surfaceReady]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showConversation ? (
        <ChatConversation
          className="min-h-0 flex-1"
          onSurfaceReady={handleConversationReady}
        >
          <ChatMessageList
            messages={displayedMessages as ChatMessage[]}
            isStreaming={session.isStreaming}
            isAwaitingResponse={session.isAwaitingResponse}
            liveSpecStore={session.liveSpecStore}
            savedArtifactKeys={session.savedArtifactKeys}
            onResolveInteractive={session.resolveInteractive}
            onBottomSpecPendingChange={handleBottomSpecPendingChange}
            onSaveArtifact={session.handleSaveArtifact}
          />
        </ChatConversation>
      ) : (
        <ChatEmptyState />
      )}

      <div className="relative z-30 shrink-0 transition-opacity duration-150">
        <ChatComposer
          status={session.status as ChatStatus}
          onSubmit={session.handleSubmit}
          onStop={session.stop}
          submissionError={session.submissionError}
          clearSubmissionError={session.clearSubmissionError}
        />
      </div>
    </div>
  );
}
