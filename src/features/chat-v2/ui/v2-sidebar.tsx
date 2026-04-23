import { Link, useMatchRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, FlaskConicalIcon } from "lucide-react";
import { SquarePenIcon } from "lucide-animated";
import { HoverIcon } from "~/components/animated-icon";
import { NavUser } from "~/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { V2ThreadList } from "./v2-thread-list";

const user = {
  name: "User",
  email: "user@example.com",
  avatar: "",
};

export function V2Sidebar(props: React.ComponentProps<typeof Sidebar>) {
  const matchRoute = useMatchRoute();
  const isThreadRouteActive = Boolean(
    matchRoute({ to: "/v2/chat/$threadId", fuzzy: false }),
  );
  const isNewChatActive =
    !isThreadRouteActive &&
    (Boolean(matchRoute({ to: "/v2", fuzzy: false })) ||
      Boolean(matchRoute({ to: "/v2/chat", fuzzy: false })));

  return (
    <Sidebar collapsible="icon" className="select-none" {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
            <FlaskConicalIcon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">Teammate V2</span>
            <span className="truncate text-xs">Sidebar/Chat Beta</span>
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
                to="/v2/chat"
                activeOptions={{ exact: true }}
                draggable={false}
                state={(prev) => ({
                  ...prev,
                  __newV2ChatNavNonce: Date.now(),
                })}
              >
                <HoverIcon as={SquarePenIcon} />
                <span className="group-data-[collapsible=icon]:hidden">
                  New Chat
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <V2ThreadList />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to current chat">
              <Link to="/" draggable={false}>
                <ArrowLeftIcon className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Back to V1
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
