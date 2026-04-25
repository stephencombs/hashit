import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "~/app/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/shared/ui/sidebar";

type AppLayoutProps = {
  defaultSidebarOpen: boolean;
};

export function AppLayout({ defaultSidebarOpen }: AppLayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      className="[--sidebar-width:280px]"
    >
      <AppSidebar />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
