import { Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "~/shared/ui/sidebar";
import { V3Sidebar } from "~/features/chat-v3/ui/v3-sidebar";

type V3AppLayoutProps = {
  defaultSidebarOpen: boolean;
};

export function V3AppLayout({ defaultSidebarOpen }: V3AppLayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      className="[--sidebar-width:280px]"
    >
      <V3Sidebar />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
