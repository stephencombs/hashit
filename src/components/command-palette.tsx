import { useCallback, useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  CheckIcon,
  GaugeIcon,
  Layers,
  LayoutDashboardIcon,
  MessageSquareIcon,
  MoonIcon,
  PanelLeftIcon,
  PenSquareIcon,
  SunIcon,
  ZapIcon,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/components/ui/command"
import { useSidebar } from "~/components/ui/sidebar"
import { useTheme } from "~/hooks/use-theme"
import { threadListQuery } from "~/lib/queries"

const MAX_THREADS = 25

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? "⌘" : "Ctrl"

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const { data: threads = [] } = useQuery(threadListQuery)

  const recentThreads = useMemo(() => {
    return [...threads]
      .filter((t) => !t.deletedAt)
      .sort((a, b) => {
        const ap = a.pinnedAt ? 0 : 1
        const bp = b.pinnedAt ? 0 : 1
        if (ap !== bp) return ap - bp
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })
      .slice(0, MAX_THREADS)
  }, [threads])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const run = useCallback(
    (action: () => void) => {
      close()
      action()
    },
    [close],
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command
        loop
        filter={(value, search, keywords) => {
          const haystack = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase()
          const needle = search.toLowerCase().trim()
          if (!needle) return 1
          let score = 0
          if (haystack.includes(needle)) score += 1
          const tokens = needle.split(/\s+/).filter(Boolean)
          if (tokens.length > 1 && tokens.every((t) => haystack.includes(t)))
            score += 0.5
          return score
        }}
      >
        <CommandInput placeholder="Search threads, navigate, or run actions..." />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup heading="Go to">
            <CommandItem
              value="new chat home"
              keywords={["new", "chat", "home", "create"]}
              onSelect={() =>
                run(() => {
                  navigate({
                    to: "/",
                    state: (prev) => ({
                      ...(prev ?? {}),
                      __newChatNavNonce: Date.now(),
                    }),
                  })
                })
              }
            >
              <PenSquareIcon />
              <span>New Chat</span>
              <CommandShortcut>{modKey} ⇧ N</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="dashboard"
              keywords={["metrics", "overview", "dashboard"]}
              onSelect={() =>
                run(() => {
                  navigate({ to: "/dashboard" })
                })
              }
            >
              <GaugeIcon />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem
              value="canvases"
              keywords={["canvas", "boards"]}
              onSelect={() =>
                run(() => {
                  navigate({ to: "/canvas" })
                })
              }
            >
              <LayoutDashboardIcon />
              <span>Canvases</span>
            </CommandItem>
            <CommandItem
              value="artifacts"
              keywords={["saved", "widgets", "library"]}
              onSelect={() =>
                run(() => {
                  navigate({ to: "/artifacts" })
                })
              }
            >
              <Layers />
              <span>Artifacts</span>
            </CommandItem>
            <CommandItem
              value="automations"
              keywords={["schedule", "cron", "trigger"]}
              onSelect={() =>
                run(() => {
                  navigate({ to: "/automations" })
                })
              }
            >
              <ZapIcon />
              <span>Automations</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              value="toggle sidebar"
              keywords={["sidebar", "panel", "collapse"]}
              onSelect={() => run(toggleSidebar)}
            >
              <PanelLeftIcon />
              <span>Toggle sidebar</span>
              <CommandShortcut>{modKey} B</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="toggle theme"
              keywords={["dark", "light", "appearance", "theme"]}
              onSelect={() =>
                run(() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark"),
                )
              }
            >
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
              <span>
                Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
              </span>
              <CommandShortcut>{modKey} ⇧ L</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="theme system"
              keywords={["system", "auto", "theme"]}
              onSelect={() => run(() => setTheme("system"))}
            >
              <CheckIcon />
              <span>Use system theme</span>
            </CommandItem>
          </CommandGroup>

          {recentThreads.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent threads">
                {recentThreads.map((thread) => (
                  <CommandItem
                    key={thread.id}
                    value={`thread-${thread.id}-${thread.title}`}
                    keywords={[thread.title]}
                    onSelect={() =>
                      run(() => {
                        navigate({
                          to: "/chat/$threadId",
                          params: { threadId: thread.id },
                        })
                      })
                    }
                  >
                    <MessageSquareIcon />
                    <span className="truncate">{thread.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
