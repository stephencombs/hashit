import { memo, useCallback, useRef, useState } from "react";
import {
  PromptInput,
  PromptInputAttachButton,
  PromptInputAttachmentPreviewList,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
  usePromptInputAttachments,
} from "~/components/ai-elements/prompt-input";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_REQUEST,
} from "~/lib/attachment-schemas";
import { PaperclipIcon } from "lucide-react";

type V2ComposerProps = {
  onSubmit: (message: PromptInputMessage) => Promise<void> | void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
};

export const V2Composer = memo(function V2Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled = false,
}: V2ComposerProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const status = isStreaming
    ? "streaming"
    : isSubmitting
      ? "submitted"
      : "ready";

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const trimmed = message.text.trim();
      if (
        (trimmed.length === 0 && message.files.length === 0) ||
        disabled ||
        isSubmitting
      ) {
        return;
      }

      const textarea = textareaRef.current;
      const shouldRestoreFocus = document.activeElement === textarea;
      setValue("");

      setIsSubmitting(true);
      try {
        await onSubmit({
          ...message,
          text: trimmed,
        });
        if (shouldRestoreFocus && !disabled) {
          requestAnimationFrame(() => {
            const nextTextarea = textareaRef.current;
            if (!nextTextarea) return;
            const activeElement = document.activeElement as HTMLElement | null;
            const activeInsideComposer =
              activeElement != null && rootRef.current?.contains(activeElement);
            if (activeElement == null || activeInsideComposer) {
              nextTextarea.focus();
            }
          });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [disabled, isSubmitting, onSubmit],
  );

  return (
    <div ref={rootRef} className="shrink-0 pt-3 pb-6">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-6">
        <PromptInput
          onSubmit={handleSubmit}
          accept="image/*,application/pdf"
          globalDrop
          multiple
          maxFiles={MAX_ATTACHMENTS_PER_REQUEST}
          maxFileSize={MAX_ATTACHMENT_BYTES}
        >
          <PromptInputBody>
            <PromptInputAttachmentPreviewList />
            <PromptInputTextarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              placeholder="Send a message..."
              disabled={disabled}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputAttachButton>
                <PaperclipIcon className="size-4" />
              </PromptInputAttachButton>
            </PromptInputTools>
            <V2ComposerSubmit
              input={value}
              status={status}
              disabled={disabled || isSubmitting}
              onStop={onStop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
});

function V2ComposerSubmit({
  input,
  status,
  disabled,
  onStop,
}: {
  input: string;
  status: "ready" | "submitted" | "streaming";
  disabled: boolean;
  onStop?: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = input.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      status={status}
      onStop={onStop}
      disabled={disabled || (!canSubmit && status === "ready")}
    />
  );
}
