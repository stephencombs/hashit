import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { getV2Collections } from "~/features/chat-v2/data/collections";
import { V2Sidebar } from "~/features/chat-v2/ui/v2-sidebar";
import { useV2ThreadActivitySync } from "~/features/chat-v2/ui/use-v2-thread-activity-sync";

export function V2AppLayout() {
  const queryClient = useQueryClient();
  getV2Collections(queryClient);
  useV2ThreadActivitySync();

  return (
    <SidebarProvider className="[--sidebar-width:280px]">
      <V2Sidebar />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
