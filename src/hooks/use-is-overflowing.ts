import { useEffect, useState, type RefObject } from "react";

export function useIsOverflowing(
  text: string,
  ref: RefObject<HTMLElement | null>,
) {
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId: number;

    const measure = () => {
      // Only trigger a state update when the boolean actually flips so that
      // stable overflow states don't produce unnecessary re-renders.
      const next = el.scrollWidth > el.clientWidth;
      setIsOverflowing((prev) => (prev === next ? prev : next));
    };

    // Defer via rAF so the DOM read happens after the browser has finished
    // processing all of React's mutations for this frame, avoiding a forced
    // synchronous layout flush during the passive-effect commit phase.
    const check = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [text, ref]);

  return isOverflowing;
}
