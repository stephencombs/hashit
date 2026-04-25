import { createFileRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { v3ThreadSessionQueryOptions } from "~/features/chat-v3/data/query-options";

type V3ThreadLoaderArgs = {
  params: {
    threadId: string;
  };
  context: {
    queryClient: Pick<QueryClient, "ensureQueryData">;
  };
};

export function loadV3ThreadRouteData({ params, context }: V3ThreadLoaderArgs) {
  return context.queryClient.ensureQueryData(
    v3ThreadSessionQueryOptions(params.threadId),
  );
}

export const Route = createFileRoute("/v3/chat/$threadId")({
  loader: ({ params, context }) => loadV3ThreadRouteData({ params, context }),
  component: () => null,
});
