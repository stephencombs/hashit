import { createFileRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { V3AppLayout } from "~/app/layouts/v3-app-layout";
import { v3ThreadListQueryOptions } from "~/features/chat-v3/data/query-options";
import { getDefaultSidebarOpen } from "~/shared/lib/server/sidebar-state";

type V3LayoutLoaderArgs = {
  context: {
    queryClient: Pick<QueryClient, "ensureQueryData">;
  };
};

export function loadV3LayoutData({ context }: V3LayoutLoaderArgs) {
  return context.queryClient.ensureQueryData(v3ThreadListQueryOptions);
}

export const Route = createFileRoute("/v3")({
  loader: async ({ context }) => {
    await loadV3LayoutData({ context });
    return {
      defaultSidebarOpen: await getDefaultSidebarOpen(),
    };
  },
  component: V3LayoutRoute,
});

function V3LayoutRoute() {
  const { defaultSidebarOpen } = Route.useLoaderData();
  return <V3AppLayout defaultSidebarOpen={defaultSidebarOpen} />;
}
