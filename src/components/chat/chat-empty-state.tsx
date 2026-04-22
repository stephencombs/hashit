import { MessageSquareIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export interface ChatEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function ChatEmptyState({
  title = "Start a conversation",
  description = "Ask anything. Attach images, documents, or use voice.",
  icon = <MessageSquareIcon className="size-12" />,
  className,
}: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="space-y-1">
        <h3 className="text-balance font-medium text-sm">{title}</h3>
        <p className="text-pretty text-muted-foreground text-sm">
          {description}
        </p>
      </div>
    </div>
  );
}
