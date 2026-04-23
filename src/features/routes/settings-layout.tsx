import { Outlet } from "@tanstack/react-router";
import { AppPageHeader } from "~/components/app-page-header";
import { SettingsNav } from "~/components/settings-nav";

export function SettingsLayoutPage() {
  return (
    <>
      <AppPageHeader
        title={<h1 className="text-sm font-medium">Settings</h1>}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <SettingsNav />
        <main className="scrollbar-gutter-stable min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </>
  );
}
