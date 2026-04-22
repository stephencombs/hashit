import { createFileRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { v2ThreadListQueryOptions } from "~/features/chat-v2/data/query-options";
import { V2AppLayout } from "~/features/routes/v2-app-layout";

type V2LayoutLoaderArgs = {
  context: {
    queryClient: Pick<QueryClient, "ensureQueryData">;
  };
};

export function loadV2LayoutData({ context }: V2LayoutLoaderArgs) {
  return context.queryClient.ensureQueryData(v2ThreadListQueryOptions);
}

export const Route = createFileRoute("/v2")({
  loader: ({ context }) => loadV2LayoutData({ context }),
  component: V2AppLayout,
});
