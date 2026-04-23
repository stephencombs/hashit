import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

type V2ComposerProps = {
  onSubmit: (text: string) => Promise<void> | void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
};

export function V2Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled = false,
}: V2ComposerProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDisabled = disabled || isSubmitting;

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background border-t p-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Send a message..."
          className="min-h-[72px] resize-y"
          disabled={isDisabled}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          {isStreaming && onStop ? (
            <Button type="button" variant="outline" onClick={onStop}>
              Stop
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isDisabled || value.trim().length === 0}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
