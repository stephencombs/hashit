import { memo, useCallback, useState } from "react";
import type { ChatStatus } from "ai";
import type { MessagePart } from "@tanstack/ai";
import { PaperclipIcon, XCircleIcon } from "lucide-react";
import {
  VirtualConversation,
  VirtualConversationEmptyState,
} from "~/components/chat/virtual-conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputAttachButton,
  PromptInputAttachmentPreviewList,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
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


function PromptInputSubmitButton({
  input,
  status,
}: {
  input: string;
  status: ChatStatus;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = input.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      disabled={!canSubmit && status === "ready"}
      status={status}
    />
  );
}

/** Composer is isolated so typing does not re-render the transcript / virtualizer. */
const ChatComposer = memo(function ChatComposer({
  onSubmitMessage,
  status,
  submissionError,
  clearSubmissionError,
}: {
  onSubmitMessage: (message: PromptInputMessage) => Promise<void> | void;
  status: ChatStatus;
  submissionError: string | null;
  clearSubmissionError: () => void;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text.trim() && message.files.length === 0) return;
      await onSubmitMessage(message);
      setInput("");
    },
    [onSubmitMessage],
  );

  return (
    <div className="mt-4 flex w-full flex-col gap-2">
      {submissionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span className="min-w-0 flex-1">{submissionError}</span>
          <button
            type="button"
            onClick={clearSubmissionError}
            aria-label="Dismiss error"
            className="text-destructive/70 hover:text-destructive"
          >
            <XCircleIcon className="size-4" />
          </button>
        </div>
      )}
      <PromptInput
        onSubmit={handleSubmit}
        accept="image/*,application/pdf"
        globalDrop
        multiple
      >
        <PromptInputBody>
          <PromptInputAttachmentPreviewList />
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputAttachButton>
              <PaperclipIcon className="size-4" />
            </PromptInputAttachButton>
          </PromptInputTools>
          <PromptInputSubmitButton input={input} status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
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
    resolveInteractive,
    handleSubmit,
    handleSaveArtifact,
    isStreaming,
    isAwaitingResponse,
    submissionError,
    clearSubmissionError,
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
          messages={messages as unknown as import("~/components/chat/message-row").ChatMessage[]}
          isStreaming={isStreaming}
          isAwaitingResponse={isAwaitingResponse}
          liveSpecStore={liveSpecStore}
          savedArtifactKeys={savedArtifactKeys}
          onResolveInteractive={resolveInteractive}
          onSaveArtifact={handleSaveArtifact}
        />
      )}

      <ChatComposer
        onSubmitMessage={handleSubmit}
        status={status as ChatStatus}
        submissionError={submissionError}
        clearSubmissionError={clearSubmissionError}
      />
    </div>
  );
}
