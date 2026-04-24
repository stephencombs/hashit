import { createFileRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  v2ThreadAttachmentSummaryQueryOptions,
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "~/features/chat-v2/data/query-options";

type V2ThreadLoaderArgs = {
  params: {
    threadId: string;
  };
  context: {
    queryClient: Pick<QueryClient, "ensureQueryData">;
  };
};

export function loadV2ThreadRouteData({ params, context }: V2ThreadLoaderArgs) {
  return Promise.all([
    context.queryClient.ensureQueryData(
      v2ThreadSessionQueryOptions(params.threadId),
    ),
    context.queryClient.ensureQueryData(
      v2ThreadMessagesQueryOptions(params.threadId),
    ),
    context.queryClient.ensureQueryData(
      v2ThreadAttachmentSummaryQueryOptions(params.threadId),
    ),
  ]);
}

export const Route = createFileRoute("/v2/chat/$threadId")({
  loader: ({ params, context }) => loadV2ThreadRouteData({ params, context }),
  component: () => null,
});
