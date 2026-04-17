import { useCallback, useEffect, useRef, useState } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

const AT_BOTTOM_THRESHOLD_PX = 32;

export interface PinToBottomController {
  isAtBottom: boolean;
  scrollToBottom: () => void;
  /** Stable ref the consumer can read inside virtualizer.onChange. */
  isPinnedRef: React.MutableRefObject<boolean>;
}

/**
 * Tracks whether the scroll element is pinned to the bottom and exposes
 * a stable ref + scrollToBottom helper. The consumer (VirtualConversation)
 * is responsible for calling `instance.scrollToOffset(...)` from the
 * virtualizer's `onChange` callback when `isPinnedRef.current` is true and
 * total size grew — that's where the actual follow-bottom happens.
 */
export function usePinToBottom(
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>,
): PinToBottomController {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isPinnedRef = useRef(true);

  useEffect(() => {
    const el = virtualizer.scrollElement;
    if (!el) return;
    const update = () => {
      const total = virtualizer.getTotalSize();
      const visible = el.clientHeight;
      const offset = el.scrollTop;
      // If content hasn't yet exceeded the viewport, treat as "at bottom".
      const atBottom =
        total <= visible + 1 ||
        offset + visible >= total - AT_BOTTOM_THRESHOLD_PX;
      isPinnedRef.current = atBottom;
      setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom));
    };
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [virtualizer]);

  const scrollToBottom = useCallback(() => {
    const count = virtualizer.options.count;
    if (count > 0) {
      virtualizer.scrollToIndex(count - 1, { align: "end" });
    }
    isPinnedRef.current = true;
    setIsAtBottom(true);
  }, [virtualizer]);

  return { isAtBottom, scrollToBottom, isPinnedRef };
}
