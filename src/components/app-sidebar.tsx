import { useCallback, useMemo, useRef, useState } from "react"
import { formatForDisplay } from "@tanstack/react-hotkeys"
import { AppHotkeys } from "~/hooks/use-app-hotkeys"
import { CommandPalette } from "~/components/command-palette"
import { Kbd, KbdGroup } from "~/components/ui/kbd"
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckSquare2Icon,
  GaugeIcon,
  Layers,
  PenSquareIcon,
  PinIcon,
  PinOffIcon,
  SparklesIcon,
  Trash2Icon,
  LayoutDashboardIcon,
  TriangleAlertIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
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

function ItemTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isOverflowing = useIsOverflowing(title, ref)

  return (
    <TooltipProvider delay={THREAD_TOOLTIP_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger
          render={<span ref={ref} className="min-w-0 truncate" />}
        >
          {title}
        </TooltipTrigger>
        {isOverflowing && (
          <TooltipContent side="bottom">{title}</TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

function HoverActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-y-0 right-0 flex translate-x-full items-center gap-1 pr-2 pl-6 bg-gradient-to-r from-transparent to-sidebar to-30% transition-transform duration-150 ease-out group-hover/menu-item:translate-x-0 group-data-[collapsible=icon]:hidden">
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
  selected,
  onToggleSelect,
}: {
  conversation: Thread
  pinThread: ReturnType<typeof usePinThread>
  deleteThread: ReturnType<typeof useDeleteThread>
  bulkMode: boolean
  selected: boolean
  onToggleSelect: (id: string, shiftKey: boolean) => void
}) {
  const matchRoute = useMatchRoute()
  const isActive = !!matchRoute({ to: "/chat/$threadId", params: { threadId: conversation.id } })
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (bulkMode) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={selected}
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
    <SidebarMenuItem className="overflow-hidden">
      <SidebarMenuButton
        isActive={isActive}
        render={<Link to="/chat/$threadId" params={{ threadId: conversation.id }} />}
      >
        {conversation.source === "automation" && (
          <Tooltip>
            <TooltipTrigger render={<span className="flex shrink-0" />}>
              <ZapIcon className="size-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent side="right">Created by automation</TooltipContent>
          </Tooltip>
        )}
        <ItemTitle title={conversation.title} />
      </SidebarMenuButton>
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
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
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
}: {
  canvas: Canvas
  pinCanvas: ReturnType<typeof usePinCanvas>
  deleteCanvas: ReturnType<typeof useDeleteCanvas>
}) {
  const matchRoute = useMatchRoute()
  const isActive = !!matchRoute({ to: "/canvas/$canvasId", params: { canvasId: canvas.id } })

  return (
    <SidebarMenuItem className="overflow-hidden">
      <SidebarMenuButton
        isActive={isActive}
        render={<Link to="/canvas/$canvasId" params={{ canvasId: canvas.id }} />}
      >
        <LayoutDashboardIcon className="size-4" />
        <ItemTitle title={canvas.title} />
      </SidebarMenuButton>
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
    </SidebarMenuItem>
  )
}

function ThreadSection({
  label,
  threads,
  pinThread,
  deleteThread,
  bulkAction,
}: {
  label: string
  threads: Thread[]
  pinThread: ReturnType<typeof usePinThread>
  deleteThread: ReturnType<typeof useDeleteThread>
  bulkAction: "pin" | "unpin"
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
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="flex size-5 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                        onClick={() => setBulkDeleteOpen(true)}
                      />
                    }
                  >
                    <Trash2Icon className="size-3" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Delete</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        className="flex size-5 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        onClick={handleBulkPinAction}
                      />
                    }
                  >
                    {bulkAction === "pin" ? (
                      <PinIcon className="size-3" />
                    ) : (
                      <PinOffIcon className="size-3" />
                    )}
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
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
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

function ChatSidebarContent() {
  const { data: conversations = [] } = useQuery(threadListQuery)
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
      />
      <ThreadSection
        label="Recents"
        threads={recents}
        pinThread={pinThread}
        deleteThread={deleteThread}
        bulkAction="pin"
      />
    </>
  )
}

function CanvasSidebarContent() {
  const { data: canvases = [] } = useQuery(canvasListQuery)
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
  const isNewChatActive = !!matchRoute({ to: "/" })
  const isCanvasSection = !!matchRoute({ to: "/canvas", fuzzy: true })
  const [paletteOpen, setPaletteOpen] = useState(false)

  return (
    <>
    <AppHotkeys onOpenCommandPalette={() => setPaletteOpen(true)} />
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    <Sidebar collapsible="icon" className="select-none" {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <SparklesIcon className="size-4" />
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
              render={<Link to="/" />}
              tooltip="New Chat"
            >
              <PenSquareIcon />
              <span>New Chat</span>
              <KbdHint keys="Mod+Shift+N" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isCanvasSection && !!matchRoute({ to: "/canvas" })}
              render={<Link to="/canvas" />}
              tooltip="Canvases"
            >
              <LayoutDashboardIcon />
              <span>Canvases</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/dashboard" })}
              render={<Link to="/dashboard" />}
              tooltip="Dashboard"
            >
              <GaugeIcon />
              <span>Dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/artifacts" })}
              render={<Link to="/artifacts" />}
              tooltip="Artifacts"
            >
              <Layers />
              <span>Artifacts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={!!matchRoute({ to: "/automations" })}
              render={<Link to="/automations" />}
              tooltip="Automations"
            >
              <ZapIcon />
              <span>Automations</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isCanvasSection ? <CanvasSidebarContent /> : <ChatSidebarContent />}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
