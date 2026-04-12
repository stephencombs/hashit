import { useState } from "react"
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
  conversations: [
    {
      id: "1",
      title: "Help with React hooks",
      preview:
        "Can you explain the difference between useEffect and useLayoutEffect? I'm having trouble understanding when to use each one.",
      date: "Just now",
    },
    {
      id: "2",
      title: "Database schema review",
      preview:
        "I've designed a schema for my e-commerce app. Could you review the relationships between the tables?",
      date: "2 hours ago",
    },
    {
      id: "3",
      title: "TypeScript generics",
      preview:
        "I need help writing a generic function that can handle both arrays and single values. Here's what I have so far.",
      date: "Yesterday",
    },
    {
      id: "4",
      title: "CSS Grid layout",
      preview:
        "I'm trying to create a responsive dashboard layout using CSS Grid. The sidebar should collapse on mobile.",
      date: "Yesterday",
    },
    {
      id: "5",
      title: "API rate limiting",
      preview:
        "What's the best approach to implement rate limiting in a Node.js API? I'm considering token bucket vs sliding window.",
      date: "2 days ago",
    },
    {
      id: "6",
      title: "Docker compose setup",
      preview:
        "I need to set up a development environment with PostgreSQL, Redis, and my Node.js app. Can you help with the docker-compose file?",
      date: "3 days ago",
    },
    {
      id: "7",
      title: "Git branching strategy",
      preview:
        "Our team is growing and we need a better branching strategy. What do you recommend for a team of 8 developers?",
      date: "1 week ago",
    },
    {
      id: "8",
      title: "Performance optimization",
      preview:
        "My React app is rendering slowly. I've profiled it and found several components re-rendering unnecessarily.",
      date: "1 week ago",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [activeItem, setActiveItem] = useState(data.navMain[0])
  const [conversations] = useState(data.conversations)
  const { setOpen } = useSidebar()

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
                render={<a href="#" />}
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
              {conversations.map((conversation) => (
                <a
                  href="#"
                  key={conversation.id}
                  className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-medium">{conversation.title}</span>
                    <span className="ml-auto text-xs whitespace-nowrap">
                      {conversation.date}
                    </span>
                  </div>
                  <span className="line-clamp-2 w-[260px] text-xs text-muted-foreground">
                    {conversation.preview}
                  </span>
                </a>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </Sidebar>
  )
}
