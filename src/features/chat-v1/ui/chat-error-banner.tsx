import { XCircleIcon } from "lucide-react";
import { cn } from "~/shared/lib/utils";

export interface ChatErrorBannerProps {
  message: string;
  onDismiss: () => void;
  className?: string;
}

export function ChatErrorBanner({
  message,
  onDismiss,
  className,
}: ChatErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      <span className="min-w-0 flex-1 text-pretty">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="text-destructive/70 hover:text-destructive transition-colors"
      >
        <XCircleIcon className="size-4" />
      </button>
    </div>
  );
}
