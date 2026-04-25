import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, LoaderIcon, MonitorIcon } from "lucide-react";
import {
  ChevronsUpDownIcon,
  LogoutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-animated";
import { HoverIcon } from "~/shared/ui/animated-icon";

import { Avatar, AvatarFallback, AvatarImage } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { ButtonGroup } from "~/shared/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/shared/ui/dropdown-menu";
import { Input } from "~/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/shared/ui/tooltip";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/shared/ui/sidebar";
import { useTheme } from "~/shared/hooks/use-theme";

const mcpTokenStatusQuery = {
  queryKey: ["mcp-token-status"],
  queryFn: async () => {
    const res = await fetch("/api/settings/mcp-token");
    return res.json() as Promise<{
      configured: boolean;
      authenticated: boolean;
      hint?: string;
    }>;
  },
};

function StatusDot({
  configured,
  authenticated,
}: {
  configured: boolean;
  authenticated: boolean;
}) {
  const color = authenticated
    ? "bg-emerald-500"
    : configured
      ? "bg-amber-500"
      : "bg-red-500";
  return <span className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function MCPTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [token, setToken] = useState("");
  const queryClient = useQueryClient();
  const { data: status } = useQuery(mcpTokenStatusQuery);

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await fetch("/api/settings/mcp-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      return res.json() as Promise<{ authenticated: boolean; error?: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-token-status"] });
      setToken("");
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/settings/mcp-token", { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-token-status"] });
      setToken("");
    },
  });

  const statusMessage = saveMutation.data
    ? saveMutation.data.authenticated
      ? "Authenticated"
      : (saveMutation.data.error ?? "Authentication failed")
    : status?.authenticated
      ? "Authenticated"
      : status?.configured
        ? "Token saved but not authenticated"
        : "No token configured";

  const statusColor = saveMutation.data
    ? saveMutation.data.authenticated
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400"
    : status?.authenticated
      ? "text-emerald-600 dark:text-emerald-400"
      : status?.configured
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  const isPending = saveMutation.isPending || clearMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MCP API Token</DialogTitle>
          <DialogDescription>
            Enter your MCP API token to authenticate with MCP servers.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {status?.hint && (
            <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
              <span className="text-muted-foreground text-xs">Current:</span>
              <code className="flex-1 truncate font-mono text-xs">
                {status.hint}
              </code>
            </div>
          )}
          <Input
            type="password"
            placeholder={
              status?.configured ? "Enter a new token" : "Paste your API token"
            }
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && token.trim()) {
                saveMutation.mutate(token.trim());
              }
            }}
            disabled={isPending}
          />
          <p className={`text-xs ${statusColor}`}>{statusMessage}</p>
        </div>
        <DialogFooter>
          {status?.configured && (
            <Button
              variant="outline"
              onClick={() => clearMutation.mutate()}
              disabled={isPending}
            >
              {clearMutation.isPending && (
                <LoaderIcon className="animate-spin" />
              )}
              Clear Token
            </Button>
          )}
          <Button
            onClick={() => saveMutation.mutate(token.trim())}
            disabled={!token.trim() || isPending}
          >
            {saveMutation.isPending && <LoaderIcon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const { data: mcpStatus } = useQuery(mcpTokenStatusQuery);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <HoverIcon
                  as={ChevronsUpDownIcon}
                  data-icon="inline-end"
                  className="group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? "top" : "right"}
              align="end"
              sideOffset={4}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  Theme
                </span>
                <ButtonGroup>
                  {(
                    [
                      { value: "light", icon: SunIcon, label: "Light" },
                      { value: "dark", icon: MoonIcon, label: "Dark" },
                      { value: "system", icon: MonitorIcon, label: "System" },
                    ] as const
                  ).map(({ value, icon: Icon, label }) => (
                    <Tooltip key={value}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={theme === value ? "secondary" : "outline"}
                          size="icon-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            setTheme(value);
                          }}
                        >
                          <Icon size={16} />
                          <span className="sr-only">{label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{label}</TooltipContent>
                    </Tooltip>
                  ))}
                </ButtonGroup>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTokenDialogOpen(true)}>
                <KeyRoundIcon />
                <span className="flex-1">MCP Token</span>
                <StatusDot
                  configured={mcpStatus?.configured ?? false}
                  authenticated={mcpStatus?.authenticated ?? false}
                />
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings/appearance">
                  <HoverIcon as={SettingsIcon} />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <HoverIcon as={LogoutIcon} />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <MCPTokenDialog
        open={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
      />
    </>
  );
}
