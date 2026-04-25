"use client";

import { Button } from "~/shared/ui/button";
import { cn } from "~/shared/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom> & {
  onSurfaceReady?: () => void;
  readinessTimeoutMs?: number;
};

function ConversationInitialSnapToBottom({
  onSurfaceReady,
  readinessTimeoutMs = 2_500,
}: {
  onSurfaceReady?: () => void;
  readinessTimeoutMs?: number;
}) {
  const readyRef = useRef(false);
  const startedRef = useRef(false);
  const { contentRef, scrollRef, scrollToBottom } = useStickToBottomContext();

  useLayoutEffect(() => {
    let cancelled = false;
    let waitForRefFrame = 0;
    let settleFrame = 0;
    let timeoutId = 0;
    let viewportObserver: ResizeObserver | undefined;

    const notifyReady = () => {
      if (readyRef.current || cancelled) return;
      readyRef.current = true;
      onSurfaceReady?.();
    };

    const startWhenReady = () => {
      if (cancelled || startedRef.current || readyRef.current) return;
      const scrollEl = scrollRef.current;
      if (!scrollEl) {
        waitForRefFrame = requestAnimationFrame(startWhenReady);
        return;
      }
      startedRef.current = true;

      let settledFrames = 0;

      const anchorBottom = () =>
        scrollToBottom({
          animation: "instant",
          wait: true,
          preserveScrollPosition: true,
        });

      const distanceFromBottom = () =>
        Math.max(
          0,
          scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop,
        );

      const settleLoop = () => {
        settleFrame = requestAnimationFrame(() => {
          if (cancelled || readyRef.current) return;
          const drift = distanceFromBottom();
          if (drift <= 2) {
            settledFrames += 1;
          } else {
            settledFrames = 0;
            void anchorBottom();
          }
          if (settledFrames >= 2) {
            notifyReady();
            return;
          }
          settleLoop();
        });
      };

      void anchorBottom();
      settleLoop();

      timeoutId = window.setTimeout(() => {
        if (readyRef.current || cancelled) return;
        void anchorBottom();
        notifyReady();
      }, readinessTimeoutMs);

      if (typeof ResizeObserver !== "undefined") {
        viewportObserver = new ResizeObserver(() => {
          if (readyRef.current || cancelled) return;
          void anchorBottom();
        });
        viewportObserver.observe(scrollEl);
        if (contentRef.current) {
          viewportObserver.observe(contentRef.current);
        }
      }
    };

    startWhenReady();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (waitForRefFrame) cancelAnimationFrame(waitForRefFrame);
      if (settleFrame) cancelAnimationFrame(settleFrame);
      viewportObserver?.disconnect();
    };
  }, [
    contentRef,
    onSurfaceReady,
    readinessTimeoutMs,
    scrollRef,
    scrollToBottom,
  ]);

  return null;
}

export const Conversation = ({
  onSurfaceReady,
  readinessTimeoutMs,
  className,
  children,
  ...props
}: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="instant"
    resize="instant"
    role="log"
    {...props}
  >
    {(context) => (
      <>
        <ConversationInitialSnapToBottom
          onSurfaceReady={onSurfaceReady}
          readinessTimeoutMs={readinessTimeoutMs}
        />
        {typeof children === "function" ? children(context) : children}
      </>
    )}
  </StickToBottom>
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number,
  ) => string = defaultFormatMessage,
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
