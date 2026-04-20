import { useCallback, useMemo, useRef, useState } from "react"
import { formatForDisplay } from "@tanstack/react-hotkeys"
import { AppHotkeys } from "~/hooks/use-app-hotkeys"
import { CommandPalette } from "~/components/command-palette"
import { Kbd, KbdGroup } from "~/components/ui/kbd"
import { Link, useLocation, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckSquare2Icon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  LayoutDashboardIcon,
  TriangleAlertIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import {
  GaugeIcon,
  LayersIcon,
  SparklesIcon,
  SquarePenIcon,
  ZapIcon as AnimatedZapIcon,
} from "lucide-animated"
import { HoverIcon } from "~/components/animated-icon"
import { Checkbox } from "~/components/ui/checkbox"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

import { NavUser } from "~/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useIsOverflowing } from "~/hooks/use-is-overflowing"
import { Skeleton } from "~/components/ui/skeleton"
import { threadListQuery } from "~/lib/queries"
import { canvasListQuery } from "~/lib/canvas-queries"
import type { Thread } from "~/lib/schemas"
import type { Canvas } from "~/lib/canvas-schemas"

const user = {
  name: "User",
  email: "user@example.com",
  avatar: "",
}

function KbdHint({ keys }: { keys: string }) {
  const parts = formatForDisplay(keys).split(/\s+/).filter(Boolean)
  return (
    <KbdGroup className="ml-auto hidden group-data-[collapsible=icon]:hidden md:inline-flex">
      {parts.map((part, i) => (
        <Kbd key={i}>{part}</Kbd>
      ))}
    </KbdGroup>
  )
}

// Delay (ms) before a thread-title tooltip appears on hover. Long enough
// that casually scanning the thread list doesn't flash tooltips on every
// row, short enough to feel responsive when you actually pause on one.
const THREAD_TOOLTIP_DELAY_MS = 500
// Sidebar rows have a 4px vertical menu gap. Extend the clickable surface by
// 2px above and below so there is no dead zone between adjacent thread items.
const SIDEBAR_ROW_HIT_AREA_CLASS_NAME = "overflow-visible hit-area-y-0.5"

function ItemTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isOverflowing = useIsOverflowing(title, ref)

  return (
    <TooltipProvider delayDuration={THREAD_TOOLTIP_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span ref={ref} className="min-w-0 truncate">
            {title}
          </span>
        </TooltipTrigger>
        {isOverflowing && (
          <TooltipContent side="bottom">{title}</TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

/** Right-edge slide-in actions. Render inside `HoverActionsClip` so overflow does not clip the row link’s hit-area. */
function HoverActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex translate-x-full items-center justify-end gap-1 pr-2 pl-6 bg-gradient-to-r from-transparent to-sidebar to-30% transition-transform duration-150 ease-out group-hover/menu-item:translate-x-0">
      {children}
    </div>
  )
}

/** Clips off-screen hover actions horizontally without clipping the thread/canvas link (hit-area ::before). */
function HoverActionsClip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-y-0 right-0 z-[1] w-[7rem] overflow-hidden group-data-[collapsible=icon]:hidden"
      aria-hidden
    >
      {children}
    </div>
  )
}

function HoverButton({
  onClick,
  label,
  children,
}: {
  onClick: (e: React.MouseEvent) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={(e) => {
        e.preventDefault()
        e.currentTarget.blur()
        onClick(e)
      }}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

function usePinThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, pinned }: { threadId: string; pinned: boolean }) => {
      await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] })
    },
  })
}

function useDeleteThread() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (threadId: string) => {
      await fetch(`/api/threads/${threadId}`, { method: "DELETE" })
    },
    onSuccess: (_data, threadId) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] })
      if (window.location.pathname.includes(threadId)) {
        navigate({ to: "/" })
      }
    },
  })
}

function useBulkDeleteThreads() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (threadIds: string[]) => {
      await Promise.all(
        threadIds.map((id) => fetch(`/api/threads/${id}`, { method: "DELETE" })),
      )
    },
    onSuccess: (_data, threadIds) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] })
      if (threadIds.some((id) => window.location.pathname.includes(id))) {
        navigate({ to: "/" })
      }
    },
  })
}

function useBulkPinThreads() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadIds, pinned }: { threadIds: string[]; pinned: boolean }) => {
      await Promise.all(
        threadIds.map((id) =>
          fetch(`/api/threads/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinned }),
          }),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] })
    },
  })
}

function usePinCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ canvasId, pinned }: { canvasId: string; pinned: boolean }) => {
      await fetch(`/api/canvas/${canvasId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] })
    },
  })
}

function useDeleteCanvas() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (canvasId: string) => {
      await fetch(`/api/canvas/${canvasId}`, { method: "DELETE" })
    },
    onSuccess: (_data, canvasId) => {
      queryClient.invalidateQueries({ queryKey: ["canvases"] })
      if (window.location.pathname.includes(canvasId)) {
        navigate({ to: "/canvas" })
      }
    },
  })
}

function ThreadItem({
  conversation,
  pinThread,
  deleteThread,
  bulkMode,
  currentPathname,
  selected,
  onToggleSelect,
}: {
  conversation: Thread
  pinThread: ReturnType<typeof usePinThread>
  deleteThread: ReturnType<typeof useDeleteThread>
  bulkMode: boolean
  currentPathname?: string
  selected: boolean
  onToggleSelect: (id: string, shiftKey: boolean) => void
}) {
  const matchRoute = useMatchRoute()
  const isActive = currentPathname
    ? currentPathname === `/chat/${conversation.id}`
    : !!matchRoute({ to: "/chat/$threadId", params: { threadId: conversation.id } })
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (bulkMode) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={selected}
          className={SIDEBAR_ROW_HIT_AREA_CLASS_NAME}
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault()
          }}
          onClick={(e) => onToggleSelect(conversation.id, e.shiftKey)}
        >
          <Checkbox checked={selected} tabIndex={-1} className="pointer-events-none" />
          <ItemTitle title={conversation.title} />
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        asChild
        className={SIDEBAR_ROW_HIT_AREA_CLASS_NAME}
      >
        <Link
          to="/chat/$threadId"
          params={{ threadId: conversation.id }}
          draggable={false}
        >
          {conversation.source === "automation" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0">
                  <ZapIcon className="size-4 text-amber-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">Created by automation</TooltipContent>
            </Tooltip>
          )}
          <ItemTitle title={conversation.title} />
        </Link>
      </SidebarMenuButton>
      <HoverActionsClip>
        <HoverActions>
          <HoverButton
            onClick={() => pinThread.mutate({ threadId: conversation.id, pinned: !conversation.pinnedAt })}
            label={conversation.pinnedAt ? "Unpin" : "Pin"}
          >
            {conversation.pinnedAt ? <PinOffIcon className="size-5" /> : <PinIcon className="size-5" />}
          </HoverButton>
          <HoverButton
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDeleteOpen(true)
            }}
            label="Delete"
          >
            <Trash2Icon className="size-5" />
          </HoverButton>
        </HoverActions>
      </HoverActionsClip>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlertIcon className="size-5 text-destructive" />
            </div>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              Permanently delete &quot;{conversation.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteThread.isPending}
              onClick={() =>
                deleteThread.mutate(conversation.id, {
                  onSuccess: () => setDeleteOpen(false),
                })
              }
            >
              {deleteThread.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  )
}

function CanvasItem({
  canvas,
  pinCanvas,
  deleteCanvas,
  currentPathname,
}: {
  canvas: Canvas
  pinCanvas: ReturnType<typeof usePinCanvas>
  deleteCanvas: ReturnType<typeof useDeleteCanvas>
  currentPathname?: string
}) {
  const matchRoute = useMatchRoute()
  const isActive = currentPathname
    ? currentPathname === `/canvas/${canvas.id}`
    : !!matchRoute({ to: "/canvas/$canvasId", params: { canvasId: canvas.id } })

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        asChild
        className={SIDEBAR_ROW_HIT_AREA_CLASS_NAME}
      >
        <Link
          to="/canvas/$canvasId"
          params={{ canvasId: canvas.id }}
          draggable={false}
        >
          <LayoutDashboardIcon className="size-4" />
          <ItemTitle title={canvas.title} />
        </Link>
      </SidebarMenuButton>
      <HoverActionsClip>
        <HoverActions>
          <HoverButton
            onClick={() => pinCanvas.mutate({ canvasId: canvas.id, pinned: !canvas.pinnedAt })}
            label={canvas.pinnedAt ? "Unpin" : "Pin"}
          >
            {canvas.pinnedAt ? <PinOffIcon className="size-5" /> : <PinIcon className="size-5" />}
          </HoverButton>
          <HoverButton
            onClick={() => deleteCanvas.mutate(canvas.id)}
            label="Delete"
          >
            <Trash2Icon className="size-5" />
          </HoverButton>
        </HoverActions>
      </HoverActionsClip>
    </SidebarMenuItem>
  )
}

function ThreadSection({
  label,
  threads,
  pinThread,
  deleteThread,
  bulkAction,
  currentPathname,
}: {
  label: string
  threads: Thread[]
  pinThread: ReturnType<typeof usePinThread>
  deleteThread: ReturnType<typeof useDeleteThread>
  bulkAction: "pin" | "unpin"
  currentPathname?: string
}) {
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  // Set of rows that belong to the active shift-drag range anchored at
  // `anchorId`. When the user shift+clicks again from the same anchor, we
  // remove the previous range and apply the new one — this is what makes
  // the selection "shrink" correctly when the second shift+click lands
  // between the anchor and the prior shift+click (macOS Finder behavior).
  const [rangeIds, setRangeIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkDelete = useBulkDeleteThreads()
  const bulkPin = useBulkPinThreads()

  const handleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && anchorId) {
        const ids = threads.map((t) => t.id)
        const a = ids.indexOf(anchorId)
        const b = ids.indexOf(id)
        if (a === -1 || b === -1) return
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const newRange = ids.slice(lo, hi + 1)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          // Remove the previous shift-drag range, then reapply the new one.
          // If the anchor itself is not selected, treat the shift-drag as a
          // deselect sweep (Finder behavior when the anchor row was toggled
          // off before the shift+click).
          for (const rid of rangeIds) next.delete(rid)
          const anchorSelected = next.has(anchorId) || newRange.includes(anchorId)
          for (const rid of newRange) {
            if (anchorSelected) next.add(rid)
            else next.delete(rid)
          }
          return next
        })
        setRangeIds(new Set(newRange))
        // Anchor does NOT move on shift+click — that's the carry-forward part.
        return
      }

      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchorId(id)
      setRangeIds(new Set())
    },
    [anchorId, rangeIds, threads],
  )

  const exitBulkMode = useCallback(() => {
    setBulkMode(false)
    setSelectedIds(new Set())
    setAnchorId(null)
    setRangeIds(new Set())
  }, [])

  const allSelected = selectedIds.size === threads.length && threads.length > 0

  const handleToggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(threads.map((t) => t.id)))
    setRangeIds(new Set())
  }, [allSelected, threads])

  const handleBulkDelete = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    bulkDelete.mutate(ids, {
      onSuccess: () => {
        setBulkDeleteOpen(false)
        exitBulkMode()
      },
    })
  }, [selectedIds, bulkDelete, exitBulkMode])

  const handleBulkPinAction = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    bulkPin.mutate(
      { threadIds: ids, pinned: bulkAction === "pin" },
      { onSuccess: () => exitBulkMode() },
    )
  }, [selectedIds, bulkPin, bulkAction, exitBulkMode])

  if (threads.length === 0) return null

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        {bulkMode ? (
          <span className="flex flex-1 items-center gap-2">
            <button
              className="flex items-center text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={handleToggleAll}
            >
              <Checkbox checked={allSelected} tabIndex={-1} className="pointer-events-none size-3.5" />
            </button>
            <span className="flex-1 truncate">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : label}
            </span>
            {selectedIds.size > 0 && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex size-5 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex size-5 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      onClick={handleBulkPinAction}
                    >
                      {bulkAction === "pin" ? (
                        <PinIcon className="size-3" />
                      ) : (
                        <PinOffIcon className="size-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {bulkAction === "pin" ? "Pin" : "Unpin"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <button
              className="flex size-5 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={exitBulkMode}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ) : (
          <span className="flex flex-1 items-center justify-between">
            <span>{label}</span>
            {threads.length > 1 && (
              <button
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-normal text-sidebar-foreground/50 hover:text-sidebar-foreground"
                onClick={() => setBulkMode(true)}
              >
                <CheckSquare2Icon className="size-3" />
                Select
              </button>
            )}
          </span>
        )}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {threads.map((conversation) => (
            <ThreadItem
              key={conversation.id}
              conversation={conversation}
              pinThread={pinThread}
              deleteThread={deleteThread}
              bulkMode={bulkMode}
              currentPathname={currentPathname}
              selected={selectedIds.has(conversation.id)}
              onToggleSelect={handleSelect}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlertIcon className="size-5 text-destructive" />
            </div>
            <DialogTitle>Delete conversations?</DialogTitle>
            <DialogDescription>
              Permanently delete {selectedIds.size} conversation
              {selectedIds.size === 1 ? "" : "s"}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDelete.isPending || selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              {bulkDelete.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  )
}

function SidebarSkeletonGroup({ widths }: { widths: string[] }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      {/* Matches SidebarGroupLabel: h-8 px-2 flex items-center rounded-md */}
      <div className="flex h-8 shrink-0 items-center rounded-md px-2">
        <Skeleton className="h-3 w-14" />
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {widths.map((w, i) => (
            <SidebarMenuItem key={i}>
              {/* Matches SidebarMenuButton default: h-8 p-2 flex w-full items-center rounded-md */}
              <div className="flex h-8 w-full items-center rounded-md p-2">
                <Skeleton className={`h-3.5 ${w}`} />
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SidebarListSkeleton() {
  return (
    <>
      <SidebarSkeletonGroup widths={["w-3/5", "w-1/2"]} />
      <SidebarSkeletonGroup widths={["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"]} />
    </>
  )
}

function ChatSidebarContent({ currentPathname }: { currentPathname?: string }) {
  const { data: conversations = [], isPending } = useQuery(threadListQuery)
  const pinThread = usePinThread()
  const deleteThread = useDeleteThread()

  const { pinned, recents } = useMemo(() => {
    const pinned: Thread[] = []
    const recents: Thread[] = []
    for (const c of conversations) {
      if (c.pinnedAt) pinned.push(c)
      else recents.push(c)
    }
    return { pinned, recents }
  }, [conversations])

  if (isPending) return <SidebarListSkeleton />

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
        No conversations yet
      </div>
    )
  }

  return (
    <>
      <ThreadSection
        label="Pinned"
        threads={pinned}
        pinThread={pinThread}
        deleteThread={deleteThread}
        bulkAction="unpin"
        currentPathname={currentPathname}
      />
      <ThreadSection
        label="Recents"
        threads={recents}
        pinThread={pinThread}
        deleteThread={deleteThread}
        bulkAction="pin"
        currentPathname={currentPathname}
      />
    </>
  )
}

function CanvasSidebarContent({ currentPathname }: { currentPathname?: string }) {
  const { data: canvases = [], isPending } = useQuery(canvasListQuery)
  const pinCanvas = usePinCanvas()
  const deleteCanvas = useDeleteCanvas()

  const { pinned, recents } = useMemo(() => {
    const pinned: Canvas[] = []
    const recents: Canvas[] = []
    for (const c of canvases) {
      if (c.pinnedAt) pinned.push(c)
      else recents.push(c)
    }
    return { pinned, recents }
  }, [canvases])

  if (isPending) return <SidebarListSkeleton />

  if (canvases.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
        No canvases yet
      </div>
    )
  }

  return (
    <>
      {pinned.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Pinned</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pinned.map((canvas) => (
                <CanvasItem
                  key={canvas.id}
                  canvas={canvas}
                  pinCanvas={pinCanvas}
                  deleteCanvas={deleteCanvas}
                  currentPathname={currentPathname}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {recents.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recents.map((canvas) => (
                <CanvasItem
                  key={canvas.id}
                  canvas={canvas}
                  pinCanvas={pinCanvas}
                  deleteCanvas={deleteCanvas}
                  currentPathname={currentPathname}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const matchRoute = useMatchRoute()
  const location = useLocation()
  // Route masking keeps runtime route state at `/` while showing `/chat/$threadId`
  // in the address bar. Prefer the masked pathname for sidebar active states.
  const currentPathname = location.maskedLocation?.pathname ?? location.pathname
  const isNewChatActive = currentPathname
    ? currentPathname === "/"
    : !!matchRoute({ to: "/" })
  const isCanvasSection = currentPathname
    ? currentPathname === "/canvas" || currentPathname.startsWith("/canvas/")
    : !!matchRoute({ to: "/canvas", fuzzy: true })
  const [paletteOpen, setPaletteOpen] = useState(false)

  return (
    <>
    <AppHotkeys onOpenCommandPalette={() => setPaletteOpen(true)} />
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    <Sidebar collapsible="icon" className="select-none" {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <HoverIcon as={SparklesIcon} />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Teammate</span>
            <span className="truncate text-xs">AI Chat</span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isNewChatActive}
              asChild
              tooltip="New Chat"
            >
              <Link
                to="/"
                draggable={false}
                state={(prev) => ({
                  ...(prev ?? {}),
                  __newChatNavNonce: Date.now(),
                })}
              >
                <HoverIcon as={SquarePenIcon} />
                <span className="group-data-[collapsible=icon]:hidden">New Chat</span>
                <KbdHint keys="Mod+Shift+N" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/dashboard" })}
              asChild
              tooltip="Dashboard"
            >
              <Link to="/dashboard" draggable={false}>
                <HoverIcon as={GaugeIcon} />
                <span className="group-data-[collapsible=icon]:hidden">Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/artifacts" })}
              asChild
              tooltip="Artifacts"
            >
              <Link to="/artifacts" draggable={false}>
                <HoverIcon as={LayersIcon} />
                <span className="group-data-[collapsible=icon]:hidden">Artifacts</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/automations" })}
              asChild
              tooltip="Automations"
            >
              <Link to="/automations" draggable={false}>
                <HoverIcon as={AnimatedZapIcon} />
                <span className="group-data-[collapsible=icon]:hidden">Automations</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isCanvasSection ? (
          <CanvasSidebarContent currentPathname={currentPathname} />
        ) : (
          <ChatSidebarContent currentPathname={currentPathname} />
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
