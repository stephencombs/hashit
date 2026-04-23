import { memo, useCallback, useRef, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "~/components/ai-elements/prompt-input";

type V2ComposerProps = {
  onSubmit: (text: string) => Promise<void> | void;
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
  const status = isStreaming ? "streaming" : isSubmitting ? "submitted" : "ready";
  const isSubmitDisabled = disabled || isSubmitting || value.trim().length === 0;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const trimmed = message.text.trim();
      if (!trimmed || disabled || isSubmitting) return;

      const textarea = textareaRef.current;
      const shouldRestoreFocus = document.activeElement === textarea;
      setValue("");

      setIsSubmitting(true);
      try {
        await onSubmit(trimmed);
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
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              placeholder="Send a message..."
              disabled={disabled}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              disabled={isSubmitDisabled}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
});
