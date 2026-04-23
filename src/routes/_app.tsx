import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "~/features/routes/app-layout";
import { getDefaultSidebarOpen } from "~/lib/server/sidebar-state";

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
