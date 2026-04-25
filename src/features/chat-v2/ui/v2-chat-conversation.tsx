import type { ReactNode } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "~/shared/ai-elements/conversation";
import { cn } from "~/shared/lib/utils";

export interface V2ChatConversationProps {
  children: ReactNode;
  className?: string;
  onSurfaceReady?: () => void;
}

export function V2ChatConversation({
  children,
  className,
  onSurfaceReady,
}: V2ChatConversationProps) {
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
