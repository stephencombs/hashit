import { createFileRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { v2ThreadListQueryOptions } from "~/features/chat-v2/data/query-options";
import { V2AppLayout } from "~/features/routes/v2-app-layout";
import { getDefaultSidebarOpen } from "~/lib/server/sidebar-state";

type V2LayoutLoaderArgs = {
  context: {
    queryClient: Pick<QueryClient, "ensureQueryData">;
  };
};

export function loadV2LayoutData({ context }: V2LayoutLoaderArgs) {
  return context.queryClient.ensureQueryData(v2ThreadListQueryOptions);
}

export const Route = createFileRoute("/v2")({
  loader: async ({ context }) => {
    await loadV2LayoutData({ context });
    return {
      defaultSidebarOpen: await getDefaultSidebarOpen(),
    };
  },
  component: V2LayoutRoute,
});

function V2LayoutRoute() {
  const { defaultSidebarOpen } = Route.useLoaderData();
  return <V2AppLayout defaultSidebarOpen={defaultSidebarOpen} />;
}
