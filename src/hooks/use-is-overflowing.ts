import { useEffect, useState, type RefObject } from "react"

export function useIsOverflowing(
  text: string,
  ref: RefObject<HTMLElement | null>
) {
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const check = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth)
    }

    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, ref])

  return isOverflowing
}
