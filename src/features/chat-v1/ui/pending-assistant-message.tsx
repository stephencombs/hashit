import { memo } from "react";
import { Message, MessageContent } from "~/shared/ai-elements/message";
import { Shimmer } from "~/shared/ai-elements/shimmer";

function PendingAssistantMessageImpl() {
  return (
    <Message
      from="assistant"
      aria-live="polite"
      aria-label="Assistant is thinking"
    >
      <MessageContent>
        <Shimmer as="span" className="text-sm" duration={3.8} spread={3}>
          Thinking…
        </Shimmer>
      </MessageContent>
    </Message>
  );
}

export const PendingAssistantMessage = memo(PendingAssistantMessageImpl);
