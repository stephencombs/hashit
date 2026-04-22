import type { Spec } from "@json-render/core";
import {
  MessageRow,
  type ChatMessage,
} from "~/components/chat/message-row";
import { PendingAssistantMessage } from "~/components/chat/pending-assistant-message";
import {
  useLiveSpecsSnapshot,
  type LiveSpecStore,
} from "~/lib/live-spec-store";

export interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isAwaitingResponse: boolean;
  /**
   * External store for in-flight UI specs. Subscribed via useSyncExternalStore
   * so only this list (and the streaming MessageRow it renders) re-renders on
   * each spec patch — typing in the composer never bubbles here.
   */
  liveSpecStore: LiveSpecStore;
  savedArtifactKeys: Set<string>;
  onResolveInteractive: (
    toolName: "collect_form_data" | "resolve_duplicate_entity",
    output: unknown,
  ) => void;
  onBottomSpecPendingChange?: (specKey: string, pending: boolean) => void;
  onSaveArtifact: (
    spec: Spec,
    messageId?: string,
    specIndex?: number,
  ) => void;
}

/**
 * Pure presentational message list. No virtualization:
 *
 * - Chat threads are bounded (typically <200 turns) and the real cost driver
 *   is chart/markdown rendering inside each row, not row count.
 * - Hand-rolled virtualization (TanStack Virtual) was the source of the
 *   late-layout autoscroll bug: measured row heights lag behind the actual
 *   inner DOM as charts settle, so the scroller pins to a stale offset.
 * - Offscreen rows still cheap-out via `MessageRow` memoization +
 *   Streamdown's `deferMarkdown` for non-streaming messages, so the per-row
 *   work is bounded for static history.
 *
 * If profiling later shows long threads (>500 messages) need windowing, the
 * preferred path is `content-visibility: auto` on rows EXCLUDING the last
 * (streaming) row — which keeps the bottom anchor accurate.
 */
export function ChatMessageList({
  messages,
  isStreaming,
  isAwaitingResponse,
  liveSpecStore,
  savedArtifactKeys,
  onResolveInteractive,
  onBottomSpecPendingChange,
  onSaveArtifact,
}: ChatMessageListProps) {
  const liveSpecs = useLiveSpecsSnapshot(liveSpecStore);
  const lastIndex = messages.length - 1;

  return (
    <>
      {messages.map((message, i) => (
        <MessageRow
          key={message.id}
          message={message}
          isLastMessage={i === lastIndex}
          isStreaming={isStreaming}
          liveSpecs={liveSpecs.get(message.id)}
          savedArtifactKeys={savedArtifactKeys}
          onResolveInteractive={onResolveInteractive}
          onBottomSpecPendingChange={onBottomSpecPendingChange}
          onSaveArtifact={onSaveArtifact}
        />
      ))}
      {isAwaitingResponse && <PendingAssistantMessage />}
    </>
  );
}
