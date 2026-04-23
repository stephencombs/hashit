import type { ReactNode } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "~/components/ai-elements/conversation";
import { cn } from "~/lib/utils";

export interface ChatConversationProps {
  children: ReactNode;
  className?: string;
  onSurfaceReady?: () => void;
}

/**
 * Auto-scrolling chat surface.
 *
 * Built on `use-stick-to-bottom` (via ai-elements/Conversation) which:
 * - sticks to the bottom while the assistant streams tokens / charts settle
 * - ResizeObserver-based, so late layout from charts, fonts, image decoding,
 *   and lazy-loaded components keeps the viewport pinned to the true bottom
 * - lets the user cancel stickiness by scrolling up; re-engages when they
 *   scroll back down
 * - works without `overflow-anchor` (Safari OK)
 *
 * Layout contract: the scroll viewport is full width (so the scrollbar lives
 * at the screen edge); the message content is centered in a 720px column.
 * The composer renders below this in the parent flex column.
 */
export function ChatConversation({
  children,
  className,
  onSurfaceReady,
}: ChatConversationProps) {
  // The scroll element is `ConversationContent` (full-width so the scrollbar
  // sits at the screen edge); the inner column is centered to a 720px reading
  // width. `scrollbar-gutter: stable both-edges` reserves space on both sides
  // so toggling overflow doesn't introduce horizontal layout shift.
  return (
    <Conversation
      className={cn("flex-1", className)}
      onSurfaceReady={onSurfaceReady}
    >
      <ConversationContent className="px-0 py-6 [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6">
          {children}
        </div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
