import { useMemo, useRef } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  HashIcon,
  PenSquareIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

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
import type { Thread } from "~/lib/schemas"

const user = {
  name: "User",
  email: "user@example.com",
  avatar: "",
}

function ConversationTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isOverflowing = useIsOverflowing(title, ref)

  return (
    <TooltipProvider delay={300}>
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
      const pathname = window.location.pathname
      if (pathname.includes(threadId)) {
        navigate({ to: "/" })
      }
    },
  })
}

function ThreadItem({
  conversation,
  pinThread,
  deleteThread,
}: {
  conversation: Thread
  pinThread: ReturnType<typeof usePinThread>
  deleteThread: ReturnType<typeof useDeleteThread>
}) {
  return (
    <SidebarMenuItem className="overflow-hidden">
      <SidebarMenuButton
        render={
          <Link
            to="/chat/$threadId"
            params={{ threadId: conversation.id }}
          />
        }
      >
        <ConversationTitle title={conversation.title} />
      </SidebarMenuButton>
      <div className="absolute inset-y-0 right-0 flex translate-x-full items-center gap-1 pr-2 pl-6 bg-gradient-to-r from-transparent to-sidebar to-30% transition-transform duration-150 ease-out group-hover/menu-item:translate-x-0 group-data-[collapsible=icon]:hidden">
        <button
          className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={(e) => {
            e.preventDefault()
            e.currentTarget.blur()
            pinThread.mutate({
              threadId: conversation.id,
              pinned: !conversation.pinnedAt,
            })
          }}
        >
          {conversation.pinnedAt ? (
            <PinOffIcon className="size-5" />
          ) : (
            <PinIcon className="size-5" />
          )}
          <span className="sr-only">
            {conversation.pinnedAt ? "Unpin" : "Pin"}
          </span>
        </button>
        <button
          className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={(e) => {
            e.preventDefault()
            e.currentTarget.blur()
            deleteThread.mutate(conversation.id)
          }}
        >
          <Trash2Icon className="size-5" />
          <span className="sr-only">Delete</span>
        </button>
      </div>
    </SidebarMenuItem>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <HashIcon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Hashit</span>
            <span className="truncate text-xs">AI Chat</span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/" />}
              tooltip="New Chat"
            >
              <PenSquareIcon />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
            No conversations yet
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pinned.map((conversation) => (
                      <ThreadItem
                        key={conversation.id}
                        conversation={conversation}
                        pinThread={pinThread}
                        deleteThread={deleteThread}
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
                    {recents.map((conversation) => (
                      <ThreadItem
                        key={conversation.id}
                        conversation={conversation}
                        pinThread={pinThread}
                        deleteThread={deleteThread}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
