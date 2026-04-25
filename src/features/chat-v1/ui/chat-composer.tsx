import { memo, useCallback, useState } from "react";
import type { ChatStatus } from "ai";
import { PaperclipIcon } from "lucide-react";
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
} from "~/shared/ai-elements/prompt-input";
import { ChatErrorBanner } from "~/features/chat-v1/ui/chat-error-banner";

export interface ChatComposerProps {
  status: ChatStatus;
  onSubmit: (message: PromptInputMessage) => Promise<void> | void;
  /** When set, the submit button doubles as a stop button while streaming. */
  onStop?: () => void;
  submissionError: string | null;
  clearSubmissionError: () => void;
}

/**
 * Composer dock. Memoized so transcript re-renders never re-render the input.
 * Owns its own `input` string locally — the parent never sees keystrokes.
 */
export const ChatComposer = memo(function ChatComposer({
  status,
  onSubmit,
  onStop,
  submissionError,
  clearSubmissionError,
}: ChatComposerProps) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text.trim() && message.files.length === 0) return;
      await onSubmit(message);
      setInput("");
    },
    [onSubmit],
  );

  return (
    <div className="shrink-0 pt-3 pb-6">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-6">
        {submissionError && (
          <ChatErrorBanner
            message={submissionError}
            onDismiss={clearSubmissionError}
          />
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
            <ComposerSubmit input={input} status={status} onStop={onStop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
});

/**
 * Inner submit so it can read `usePromptInputAttachments()` (which requires a
 * PromptInput ancestor) without forcing the whole composer to subscribe.
 */
function ComposerSubmit({
  input,
  status,
  onStop,
}: {
  input: string;
  status: ChatStatus;
  onStop?: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = input.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      disabled={!canSubmit && status === "ready"}
      status={status}
      onStop={onStop}
    />
  );
}
