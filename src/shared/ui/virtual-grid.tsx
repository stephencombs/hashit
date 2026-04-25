import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";

export interface VirtualGridProps<T> {
  items: T[];
  /** Stable key for each item — used for getItemKey + React key. */
  getKey: (item: T, index: number) => string;
  /** Render a single item. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Estimated row height in pixels (per column). */
  estimateSize?: number;
  /**
   * Number of columns. May be a number (fixed) or a function of **container**
   * width in px (responsive). Recomputed on resize via ResizeObserver.
   */
  lanes?: number | ((containerWidth: number) => number);
  /** Pixel gap between rows. Items handle horizontal gap via padding. */
  gap?: number;
  /** Number of rows to overscan above/below the viewport. */
  overscan?: number;
  /**
   * Enables dynamic per-item measurement via ResizeObserver.
   * Disable for fixed-height cards to improve scroll performance.
   */
  measureItems?: boolean;
  /**
   * When true (default), the last item spans the full row when there is an
   * odd number of items in a multi-lane grid. Set to false to keep all items
   * the same width regardless of position.
   */
  spanLastItem?: boolean;
  /**
   * Pixel offset between the top of the document and the top of the grid.
   * Used only for window scrolling.
   */
  scrollMargin?: number;
  /**
   * When set, uses element-based virtualization (scroll on this node).
   * Use for layouts where the list lives inside an overflow container instead
   * of the window.
   */
  scrollElementRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const DEFAULT_ESTIMATE = 300;
const DEFAULT_OVERSCAN = 2;
const DEFAULT_GAP = 20;

function useResponsiveLanes(
  lanes: number | ((containerWidth: number) => number) | undefined,
  containerRef: RefObject<HTMLDivElement | null>,
): number {
  const [count, setCount] = useState(() => {
    if (typeof lanes === "function") return 1;
    return lanes ?? 1;
  });

  useLayoutEffect(() => {
    if (typeof lanes !== "function") {
      setCount(lanes ?? 1);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setCount(w < 1 ? 1 : lanes(w));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [lanes, containerRef]);

  return Math.max(1, count);
}

function computeListScrollMargin(
  scrollEl: HTMLElement,
  listEl: HTMLElement,
): number {
  return Math.round(
    listEl.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop,
  );
}

type VirtualizerLike = {
  getVirtualItems: () => Array<{
    key: React.Key;
    index: number;
    lane: number;
    start: number;
  }>;
  getTotalSize: () => number;
  options: { scrollMargin: number; lanes: number };
  measureElement: (el: HTMLElement | null) => void;
};

function VirtualGridItems<T>({
  virtualizer,
  items,
  laneCount,
  gap,
  measureItems = true,
  spanLastItem = true,
  renderItem,
}: {
  virtualizer: VirtualizerLike;
  items: T[];
  laneCount: number;
  gap: number;
  measureItems?: boolean;
  spanLastItem?: boolean;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const virtualItems = virtualizer.getVirtualItems();
  const halfGap = gap / 2;
  const vLanes = Math.max(1, virtualizer.options.lanes ?? laneCount);
  const colWidthPct = 100 / vLanes;
  const lastItemSpansFullRow =
    spanLastItem && vLanes > 1 && items.length % vLanes === 1;

  return (
    <>
      {virtualItems.map((vi) => {
        const item = items[vi.index];
        if (!item) return null;
        const spanFull = lastItemSpansFullRow && vi.index === items.length - 1;
        const widthPct = spanFull ? 100 : colWidthPct;
        const leftPct = spanFull ? 0 : vi.lane * colWidthPct;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={measureItems ? virtualizer.measureElement : undefined}
            style={{
              position: "absolute",
              top: 0,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
              padding: `${halfGap}px`,
              boxSizing: "border-box",
              contain: "layout style",
            }}
          >
            {renderItem(item, vi.index)}
          </div>
        );
      })}
    </>
  );
}

function VirtualGridWithElementScroll<T>({
  items,
  getKey,
  renderItem,
  estimateSize = DEFAULT_ESTIMATE,
  lanes,
  gap = DEFAULT_GAP,
  overscan = DEFAULT_OVERSCAN,
  measureItems = true,
  spanLastItem = true,
  scrollElementRef,
  className,
}: VirtualGridProps<T> & {
  scrollElementRef: RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const laneCount = useResponsiveLanes(lanes, containerRef);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const scroll = scrollElementRef.current;
    const list = containerRef.current;
    if (!scroll || !list) return;
    const next = computeListScrollMargin(scroll, list);
    setScrollMargin((prev) => (prev === next ? prev : next));
  }, [scrollElementRef, items.length, laneCount]);

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize + gap,
    overscan,
    lanes: laneCount,
    scrollMargin,
    getItemKey: (i) => getKey(items[i], i),
    getScrollElement: () => scrollElementRef.current,
    useFlushSync: false,
  });

  const totalSize = virtualizer.getTotalSize();
  const halfGap = gap / 2;
  const marginStyle = `-${halfGap}px 0` as const;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        height: `${totalSize}px`,
        width: "100%",
        minWidth: 0,
        margin: marginStyle,
        padding: 0,
      }}
    >
      <VirtualGridItems
        virtualizer={virtualizer as unknown as VirtualizerLike}
        items={items}
        laneCount={laneCount}
        gap={gap}
        measureItems={measureItems}
        spanLastItem={spanLastItem}
        renderItem={renderItem}
      />
    </div>
  );
}

function VirtualGridWithWindowScroll<T>({
  items,
  getKey,
  renderItem,
  estimateSize = DEFAULT_ESTIMATE,
  lanes,
  gap = DEFAULT_GAP,
  overscan = DEFAULT_OVERSCAN,
  measureItems = true,
  spanLastItem = true,
  scrollMargin: scrollMarginProp,
  className,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const laneCount = useResponsiveLanes(lanes, containerRef);

  const [autoMargin, setAutoMargin] = useState(scrollMarginProp ?? 0);
  useEffect(() => {
    if (scrollMarginProp !== undefined) {
      setAutoMargin(scrollMarginProp);
      return;
    }
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAutoMargin(rect.top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [scrollMarginProp]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize + gap,
    overscan,
    lanes: laneCount,
    scrollMargin: autoMargin,
    getItemKey: (i) => getKey(items[i], i),
    useFlushSync: false,
  });

  const totalSize = virtualizer.getTotalSize();
  const halfGap = gap / 2;
  const marginStyle = `-${halfGap}px 0` as const;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        height: `${totalSize}px`,
        width: "100%",
        minWidth: 0,
        margin: marginStyle,
        padding: 0,
      }}
    >
      <VirtualGridItems
        virtualizer={virtualizer as unknown as VirtualizerLike}
        items={items}
        laneCount={laneCount}
        gap={gap}
        measureItems={measureItems}
        spanLastItem={spanLastItem}
        renderItem={renderItem}
      />
    </div>
  );
}

export function VirtualGrid<T>(props: VirtualGridProps<T>) {
  if (props.scrollElementRef) {
    return (
      <VirtualGridWithElementScroll
        {...props}
        scrollElementRef={props.scrollElementRef}
      />
    );
  }
  return <VirtualGridWithWindowScroll {...props} />;
}
