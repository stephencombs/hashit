import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { MessageRow, type ChatMessage } from "~/components/chat/message-row";
import { PendingAssistantMessage } from "~/components/chat/pending-assistant-message";
import { usePinToBottom } from "~/components/chat/use-pin-to-bottom";
import { threadScrollMemory } from "~/components/chat/thread-scroll-memory";
import { useLiveSpecsSnapshot, type LiveSpecStore } from "~/lib/live-spec-store";

const ESTIMATED_ROW_HEIGHT = 200;
const OVERSCAN = 4;
const AT_BOTTOM_THRESHOLD_PX = 32;
const PENDING_ROW_KEY = "__pending_assistant__";

export interface VirtualConversationProps {
  threadId?: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  isAwaitingResponse?: boolean;
  /**
   * External live-spec store. VirtualConversation subscribes via
   * useSyncExternalStore so only it (and the streaming MessageRow) re-renders
   * on each patch — the rest of the context tree stays stable.
   */
  liveSpecStore: LiveSpecStore;
  savedArtifactKeys: Set<string>;
  submittedFormData: Map<string, Record<string, unknown>>;
  onFormSubmit: (toolCallId: string, data: Record<string, unknown>) => void;
  onSaveArtifact: (
    spec: import("@json-render/core").Spec,
    messageId?: string,
    specIndex?: number,
  ) => void;
  className?: string;
}

export function VirtualConversation({
  threadId,
  messages,
  isStreaming,
  isAwaitingResponse = false,
  liveSpecStore,
  savedArtifactKeys,
  submittedFormData,
  onFormSubmit,
  onSaveArtifact,
  className,
}: VirtualConversationProps) {
  // Subscribe to the live-spec store. Produces a new Map reference on every
  // spec_patch / spec_complete, but unchanged entries keep the same array
  // reference so memo'd MessageRows for non-streaming messages bail out.
  const liveSpecsSnapshot = useLiveSpecsSnapshot(liveSpecStore);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialOffsetRef = useRef<number | undefined>(
    threadScrollMemory.get(threadId),
  );
  const lastTotalSizeRef = useRef(0);
  const previousThreadIdRef = useRef<string | undefined>(threadId);
  const hasAppliedInitialScrollRef = useRef(false);

  const totalRowCount = messages.length + (isAwaitingResponse ? 1 : 0);

  const getItemKey = useCallback(
    (i: number) => (i === messages.length ? PENDING_ROW_KEY : messages[i]?.id ?? i),
    [messages],
  );

  const virtualizer = useVirtualizer({
    count: totalRowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey,
    initialOffset: initialOffsetRef.current,
    // Compensate scroll position when items above the viewport change size
    // (measurement vs estimate). Without this, scrolling up through
    // unmeasured rows produces visible jolts as content above grows.
    shouldAdjustScrollPositionOnItemSizeChange: (item, _delta, instance) => {
      const offset = instance.scrollOffset ?? 0;
      return item.start < offset;
    },
    onChange: (instance, sync) => {
      // Persist scroll offset for return visits.
      threadScrollMemory.set(threadId, instance.scrollOffset ?? 0);

      // Follow-bottom: when total size grows AND the user is currently at
      // the bottom (computed inline so it can't be stale or pre-empted by
      // a remembered initialOffset). This handles streaming tokens, late
      // chart measurement, and incoming messages.
      if (sync) return;
      const total = instance.getTotalSize();
      const prev = lastTotalSizeRef.current;
      lastTotalSizeRef.current = total;
      if (total <= prev) return;
      const el = instance.scrollElement;
      if (!el) return;
      const visible = el.clientHeight;
      const atBottom =
        total <= visible + 1 ||
        el.scrollTop + visible >= prev - AT_BOTTOM_THRESHOLD_PX;
      if (!atBottom) return;
      const target = total - visible;
      if (target <= 0) return;
      el.scrollTop = target;
    },
  });

  const { isAtBottom, scrollToBottom, isPinnedRef } = usePinToBottom(virtualizer);

  // Apply thread-specific scroll restoration without remounting the whole
  // conversation tree. On first mount and thread changes:
  // - restore remembered offset if present
  // - otherwise snap to bottom to match prior remount behavior
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const previousThreadId = previousThreadIdRef.current;
    const threadChanged = previousThreadId !== threadId;
    const shouldRestoreForMount = !hasAppliedInitialScrollRef.current;

    if (!threadChanged && !shouldRestoreForMount) return;

    if (threadChanged && previousThreadId !== undefined) {
      threadScrollMemory.set(previousThreadId, el.scrollTop);
    }
    previousThreadIdRef.current = threadId;
    hasAppliedInitialScrollRef.current = true;
    initialOffsetRef.current = threadScrollMemory.get(threadId);
    lastTotalSizeRef.current = 0;

    if (initialOffsetRef.current !== undefined) {
      el.scrollTop = initialOffsetRef.current;
      isPinnedRef.current = false;
      return;
    }

    if (messages.length === 0) {
      el.scrollTop = 0;
      isPinnedRef.current = true;
      return;
    }

    scrollToBottom();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        scrollToBottom();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [threadId, messages.length, scrollToBottom, isPinnedRef]);

  // Persist the final offset on unmount (covers programmatic unmount cases
  // where the last `onChange` may have already fired with a stale value).
  useEffect(() => {
    return () => {
      const el = scrollRef.current;
      if (el) threadScrollMemory.set(threadId, el.scrollTop);
    };
  }, [threadId]);

  const items = virtualizer.getVirtualItems();

  return (
    <div className={cn("relative flex-1 min-h-0", className)}>
      <div
        ref={scrollRef}
        role="log"
        className="absolute inset-0 overflow-y-auto"
        style={{ contain: "strict", overflowAnchor: "none" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((vi) => {
              if (vi.index === messages.length) {
                if (!isAwaitingResponse) return null;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="px-4 pb-8 first:pt-4"
                  >
                    <PendingAssistantMessage />
                  </div>
                );
              }
              const message = messages[vi.index];
              if (!message) return null;
              const isLast = vi.index === messages.length - 1;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="px-4 pb-8 first:pt-4"
                >
                  <MessageRow
                    message={message}
                    isLastMessage={isLast}
                    isStreaming={isStreaming}
                    liveSpecs={liveSpecsSnapshot.get(message.id)}
                    savedArtifactKeys={savedArtifactKeys}
                    submittedFormData={submittedFormData}
                    onFormSubmit={onFormSubmit}
                    onSaveArtifact={onSaveArtifact}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ScrollToBottomButton
        isAtBottom={isAtBottom}
        onClick={scrollToBottom}
      />
    </div>
  );
}

function ScrollToBottomButton({
  isAtBottom,
  onClick,
}: {
  isAtBottom: boolean;
  onClick: () => void;
}) {
  if (isAtBottom) return null;
  return (
    <Button
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full dark:bg-background dark:hover:bg-muted"
      onClick={onClick}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}

export interface VirtualConversationEmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export function VirtualConversationEmptyState({
  icon,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
}: VirtualConversationEmptyStateProps) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{title}</h3>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
    </div>
  );
}

// Re-export for type convenience
export type { Virtualizer };
