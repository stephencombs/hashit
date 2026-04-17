import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

export interface VirtualGridProps<T> {
  items: T[];
  /** Stable key for each item — used for getItemKey + React key. */
  getKey: (item: T, index: number) => string;
  /** Render a single item. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Estimated row height in pixels (per column). */
  estimateSize?: number;
  /**
   * Number of columns. May be a number (fixed) or a function of viewport
   * width (responsive). Recomputed on resize.
   */
  lanes?: number | ((viewportWidth: number) => number);
  /** Pixel gap between rows. Items handle horizontal gap via padding. */
  gap?: number;
  /** Number of rows to overscan above/below the viewport. */
  overscan?: number;
  /**
   * Pixel offset between the top of the document and the top of the grid
   * (e.g. sticky header height). The grid auto-detects this on mount, but
   * you can override.
   */
  scrollMargin?: number;
  className?: string;
}

const DEFAULT_ESTIMATE = 300;
const DEFAULT_OVERSCAN = 2;
const DEFAULT_GAP = 20;

function useResponsiveLanes(
  lanes: number | ((viewportWidth: number) => number) | undefined,
): number {
  const compute = useCallback(() => {
    if (typeof lanes === "function") {
      if (typeof window === "undefined") return 1;
      return lanes(window.innerWidth);
    }
    return lanes ?? 1;
  }, [lanes]);

  const [count, setCount] = useState(compute);

  useEffect(() => {
    if (typeof lanes !== "function") {
      setCount(lanes ?? 1);
      return;
    }
    const update = () => setCount(lanes(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [lanes]);

  return Math.max(1, count);
}

export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  estimateSize = DEFAULT_ESTIMATE,
  lanes,
  gap = DEFAULT_GAP,
  overscan = DEFAULT_OVERSCAN,
  scrollMargin,
  className,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const laneCount = useResponsiveLanes(lanes);

  // Auto-detect scrollMargin from container's offset to document if not provided.
  const [autoMargin, setAutoMargin] = useState(scrollMargin ?? 0);
  useEffect(() => {
    if (scrollMargin !== undefined) {
      setAutoMargin(scrollMargin);
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
  }, [scrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize + gap,
    overscan,
    lanes: laneCount,
    scrollMargin: autoMargin,
    getItemKey: (i) => getKey(items[i], i),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const halfGap = gap / 2;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        height: `${totalSize}px`,
        width: "100%",
        // Negate the half-gap padding on the first/last items so the
        // visible block flushes with parent edges.
        margin: `-${halfGap}px -${halfGap}px`,
        padding: 0,
      }}
    >
      {virtualItems.map((vi) => {
        const item = items[vi.index];
        if (!item) return null;
        const widthPct = 100 / laneCount;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: `${vi.lane * widthPct}%`,
              width: `${widthPct}%`,
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
              padding: `${halfGap}px`,
              boxSizing: "border-box",
            }}
          >
            {renderItem(item, vi.index)}
          </div>
        );
      })}
    </div>
  );
}
