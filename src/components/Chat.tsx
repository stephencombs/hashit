import { memo, useCallback, useState } from "react";
import type { ChatStatus } from "ai";
import type { MessagePart } from "@tanstack/ai";
import {
  VirtualConversation,
  VirtualConversationEmptyState,
} from "~/components/chat/virtual-conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputBody,
} from "~/components/ai-elements/prompt-input";
import { MessageSquare } from "lucide-react";
import { useChatSession } from "~/components/chat/use-chat-session";

interface ChatProps {
  threadId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    parts: Array<MessagePart>;
  }>;
  onThreadCreated?: (threadId: string) => void;
}

/** Composer is isolated so typing does not re-render the transcript / virtualizer. */
const ChatComposer = memo(function ChatComposer({
  onSubmitText,
  status,
}: {
  onSubmitText: (text: string) => void;
  status: ChatStatus;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim()) return;
      onSubmitText(message.text);
      setInput("");
    },
    [onSubmitText],
  );

  return (
    <PromptInput onSubmit={handleSubmit} className="mt-4">
      <PromptInputBody>
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <div />
        <PromptInputSubmit
          disabled={!input.trim() && status === "ready"}
          status={status}
        />
      </PromptInputFooter>
    </PromptInput>
  );
});

export function Chat({
  threadId,
  initialMessages,
  onThreadCreated,
}: ChatProps) {
  const session = useChatSession({
    threadId,
    initialMessages,
    onThreadCreated,
    cancelQueriesOnUnmount: true,
  });

  const {
    activeThreadId,
    messages,
    status,
    liveSpecStore,
    savedArtifactKeys,
    submittedFormData,
    handleSubmit,
    handleFormSubmit,
    handleSaveArtifact,
    isStreaming,
    isAwaitingResponse,
  } = session;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-6">
      {messages.length === 0 ? (
        <div className="min-h-0 flex-1">
          <VirtualConversationEmptyState
            icon={<MessageSquare className="size-12" />}
            title="Start a conversation"
            description="Type a message below to begin chatting"
          />
        </div>
      ) : (
        <VirtualConversation
          threadId={activeThreadId}
          messages={messages}
          isStreaming={isStreaming}
          isAwaitingResponse={isAwaitingResponse}
          liveSpecStore={liveSpecStore}
          savedArtifactKeys={savedArtifactKeys}
          submittedFormData={submittedFormData}
          onFormSubmit={handleFormSubmit}
          onSaveArtifact={handleSaveArtifact}
        />
      )}

      <ChatComposer onSubmitText={handleSubmit} status={status as ChatStatus} />
    </div>
  );
}
