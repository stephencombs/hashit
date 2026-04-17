import { useEffect } from "react"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useNavigate } from "@tanstack/react-router"
import { useSidebar } from "~/components/ui/sidebar"
import { useTheme } from "~/hooks/use-theme"

export interface AppHotkeysProps {
  onOpenCommandPalette: () => void
}

export function AppHotkeys({ onOpenCommandPalette }: AppHotkeysProps) {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()

  useHotkey("Mod+K", (event) => {
    event.preventDefault()
    onOpenCommandPalette()
  })

  useHotkey("Mod+B", (event) => {
    event.preventDefault()
    toggleSidebar()
  })

  useHotkey("Mod+Shift+N", (event) => {
    event.preventDefault()
    navigate({ to: "/" })
  })

  useHotkey("Mod+Shift+L", (event) => {
    event.preventDefault()
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  })

  useTypeAnywhereCapture()

  return null
}

function useTypeAnywhereCapture() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.isComposing) return
      if (event.key.length !== 1) return
      const target = event.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (target.isContentEditable) return
      if (target.closest('[role="dialog"], [role="menu"], [role="listbox"]'))
        return
      if (window.getSelection()?.toString()) return
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[name="message"]',
      )
      if (!textarea) return
      if (textarea.disabled || textarea.readOnly) return
      textarea.focus({ preventScroll: true })
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])
}
