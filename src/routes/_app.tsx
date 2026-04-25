import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "~/app/layouts/app-layout";
import { getDefaultSidebarOpen } from "~/shared/lib/server/sidebar-state";

export const Route = createFileRoute("/_app")({
  loader: async () => ({
    defaultSidebarOpen: await getDefaultSidebarOpen(),
  }),
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  const { defaultSidebarOpen } = Route.useLoaderData();
  return <AppLayout defaultSidebarOpen={defaultSidebarOpen} />;
}
