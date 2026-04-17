"use client"

import * as React from "react"

type AnimatedIconHandle = {
  startAnimation: () => void
  stopAnimation: () => void
}

// lucide-animated icons are ForwardRefExoticComponents with a Handle that
// exposes startAnimation/stopAnimation. Passing a ref disables their own
// hover behavior, letting us drive the animation from an ancestor element.
type AnimatedIconComponent = React.ForwardRefExoticComponent<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any & React.RefAttributes<AnimatedIconHandle>
>

type HoverIconProps = {
  as: AnimatedIconComponent
  size?: number
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className">

/**
 * Wraps a `lucide-animated` icon so the animation plays on hover of the
 * nearest interactive ancestor (link / button / menuitem) instead of on
 * the icon itself.
 */
export function HoverIcon({ as: Icon, size = 16, ...props }: HoverIconProps) {
  const iconRef = React.useRef<AnimatedIconHandle>(null)
  const anchorRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const parent =
      (anchor.closest(
        'a, button, [role="menuitem"], [role="button"]',
      ) as HTMLElement | null) ?? anchor.parentElement
    if (!parent) return

    const enter = () => iconRef.current?.startAnimation()
    const leave = () => iconRef.current?.stopAnimation()
    parent.addEventListener("pointerenter", enter)
    parent.addEventListener("pointerleave", leave)
    parent.addEventListener("focus", enter)
    parent.addEventListener("blur", leave)
    return () => {
      parent.removeEventListener("pointerenter", enter)
      parent.removeEventListener("pointerleave", leave)
      parent.removeEventListener("focus", enter)
      parent.removeEventListener("blur", leave)
    }
  }, [])

  return (
    <>
      <span ref={anchorRef} aria-hidden className="hidden" />
      <Icon ref={iconRef} size={size} {...props} />
    </>
  )
}
