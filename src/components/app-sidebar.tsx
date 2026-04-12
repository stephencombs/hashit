import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  HashIcon,
  InboxIcon,
  MessageSquareIcon,
  PenSquareIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"

import { NavUser } from "~/components/nav-user"
import { Label } from "~/components/ui/label"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar"
import { Switch } from "~/components/ui/switch"
import { threadListQuery } from "~/lib/queries"
import type { Thread } from "~/lib/schemas"

const data = {
  user: {
    name: "User",
    email: "user@example.com",
    avatar: "",
  },
  navMain: [
    {
      title: "All Chats",
      url: "#",
      icon: MessageSquareIcon,
      isActive: true,
    },
    {
      title: "Starred",
      url: "#",
      icon: StarIcon,
      isActive: false,
    },
    {
      title: "Archived",
      url: "#",
      icon: InboxIcon,
      isActive: false,
    },
    {
      title: "Trash",
      url: "#",
      icon: Trash2Icon,
      isActive: false,
    },
    {
      title: "Settings",
      url: "#",
      icon: SettingsIcon,
      isActive: false,
    },
  ],
}

function formatDate(date: Date) {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [activeItem, setActiveItem] = useState(data.navMain[0])
  const { setOpen } = useSidebar()
  const { data: conversations = [] } = useQuery(threadListQuery)

  return (
    <Sidebar
      collapsible="icon"
      className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
      {...props}
    >
      {/* Icon strip sidebar */}
      <Sidebar
        collapsible="none"
        className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="md:h-8 md:p-0"
                render={<Link to="/" />}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <HashIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Hashit</span>
                  <span className="truncate text-xs">AI Chat</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="px-1.5 md:px-0">
              <SidebarMenu>
                {data.navMain.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={{
                        children: item.title,
                        hidden: false,
                      }}
                      onClick={() => {
                        setActiveItem(item)
                        setOpen(true)
                      }}
                      isActive={activeItem?.title === item.title}
                      className="px-2.5 md:px-2"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={data.user} />
        </SidebarFooter>
      </Sidebar>

      {/* Conversation list sidebar */}
      <Sidebar collapsible="none" className="hidden flex-1 md:flex">
        <SidebarHeader className="gap-3.5 border-b p-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-base font-medium text-foreground">
              {activeItem?.title}
            </div>
            <Label className="flex items-center gap-2 text-sm">
              <span>Starred</span>
              <Switch className="shadow-none" />
            </Label>
          </div>
          <SidebarInput placeholder="Search conversations..." />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-0">
            <SidebarGroupContent>
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                conversations.map((conversation) => (
                  <Link
                    to="/chat/$threadId"
                    params={{ threadId: conversation.id }}
                    key={conversation.id}
                    className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="truncate font-medium">
                        {conversation.title}
                      </span>
                      <span className="ml-auto text-xs whitespace-nowrap">
                        {formatDate(conversation.updatedAt)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  )
}
