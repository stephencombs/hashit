import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "~/components/ui/skeleton";

export function DeferredRender({
  children,
  prioritize = false,
  rootMargin = "1200px 0px",
  placeholder,
}: {
  children: ReactNode;
  prioritize?: boolean;
  rootMargin?: string;
  placeholder?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(prioritize);

  useEffect(() => {
    if (prioritize || mounted) return;

    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted, prioritize, rootMargin]);

  return (
    <div ref={hostRef} className="w-full min-w-0">
      {mounted
        ? children
        : (placeholder ?? <Skeleton className="h-[220px] w-full rounded-md" />)}
    </div>
  );
}
