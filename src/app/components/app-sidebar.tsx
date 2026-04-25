import { useState } from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { FlaskConicalIcon, GaugeIcon, LayersIcon, ZapIcon } from "lucide-react";
import { SquarePenIcon } from "lucide-animated";
import { CommandPalette } from "~/app/components/command-palette";
import { NavUser } from "~/app/components/nav-user";
import { V2ThreadList } from "~/features/chat-v2/ui/v2-thread-list";
import { AppHotkeys } from "~/shared/hooks/use-app-hotkeys";
import { HoverIcon } from "~/shared/ui/animated-icon";
import { Kbd, KbdGroup } from "~/shared/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/shared/ui/sidebar";

const user = {
  name: "User",
  email: "user@example.com",
  avatar: "",
};

function KbdHint({ keys }: { keys: string }) {
  const parts = formatForDisplay(keys).split(/\s+/).filter(Boolean);
  return (
    <KbdGroup className="ml-auto hidden group-data-[collapsible=icon]:hidden md:inline-flex">
      {parts.map((part, i) => (
        <Kbd key={i}>{part}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const matchRoute = useMatchRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isNewChatActive =
    Boolean(matchRoute({ to: "/v2/chat", fuzzy: false })) ||
    Boolean(matchRoute({ to: "/v2", fuzzy: false }));

  return (
    <>
      <AppHotkeys onOpenCommandPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Sidebar collapsible="icon" className="select-none" {...props}>
        <SidebarHeader>
          <div className="grid h-12 grid-cols-[auto_1fr] items-center gap-2 overflow-hidden px-2 transition-[grid-template-columns,gap,padding] duration-200 ease-linear group-data-[collapsible=icon]:grid-cols-[auto_0fr] group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
            <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M20.1002 6.42H16.8502C16.3602 6.42 15.9502 6.02 15.9502 5.52C15.9502 5.02 16.3502 4.62 16.8502 4.62H20.1002C20.5902 4.62 21.0002 5.02 21.0002 5.52C21.0002 6.02 20.6002 6.42 20.1002 6.42Z"
                  fill="#F07022"
                />
                <path
                  d="M18.4801 8.04C17.9901 8.04 17.5801 7.64 17.5801 7.14V3.89C17.5801 3.4 17.9801 2.99 18.4801 2.99C18.9801 2.99 19.3801 3.39 19.3801 3.89V7.14C19.3801 7.63 18.9801 8.04 18.4801 8.04Z"
                  fill="#F07022"
                />
                <path
                  d="M11.4905 21C10.8505 21 10.3205 20.48 10.3205 19.83C10.3205 16.43 7.56047 13.67 4.15047 13.67C3.51047 13.67 2.98047 13.15 2.98047 12.5C2.98047 11.85 3.50047 11.33 4.15047 11.33C7.55047 11.33 10.3205 8.57 10.3205 5.17C10.3205 4.53 10.8405 4 11.4905 4C12.1405 4 12.6605 4.52 12.6605 5.17C12.6605 8.57 15.4205 11.33 18.8305 11.33C19.4705 11.33 20.0005 11.85 20.0005 12.5C20.0005 13.15 19.4805 13.67 18.8305 13.67C15.4305 13.67 12.6605 16.43 12.6605 19.83C12.6605 20.47 12.1405 21 11.4905 21ZM7.24047 12.5C9.15047 13.31 10.6905 14.84 11.4905 16.75C12.3005 14.84 13.8305 13.3 15.7405 12.5C13.8305 11.69 12.2905 10.16 11.4905 8.25C10.6805 10.16 9.15047 11.7 7.24047 12.5Z"
                  fill="#F07022"
                />
              </svg>
            </div>
            <div className="min-w-0 overflow-hidden text-left text-sm leading-tight transition-[opacity,transform] duration-200 ease-linear group-data-[collapsible=icon]:translate-x-1 group-data-[collapsible=icon]:opacity-0">
              <span className="truncate font-semibold">Teammate</span>
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
                  <GaugeIcon className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    Dashboard
                  </span>
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
                  <LayersIcon className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    Artifacts
                  </span>
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
                  <ZapIcon className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    Automations
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
              <SidebarMenuButton
                isActive={!!matchRoute({ to: "/v2", fuzzy: true })}
                asChild
                tooltip="V2 Chat"
              >
                <Link to="/v2/chat" draggable={false}>
                  <FlaskConicalIcon className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    V2 Chat
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <NavUser user={user} />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
