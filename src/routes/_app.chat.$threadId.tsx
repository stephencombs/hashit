import { createFileRoute } from "@tanstack/react-router";
import {
  ChatThreadPage,
  ChatThreadPending,
} from "~/features/chat-v1/ui/chat-thread-page";
import {
  artifactsByThreadQuery,
  threadDetailQuery,
} from "~/features/chat-v1/data/queries";

export const Route = createFileRoute("/_app/chat/$threadId")({
  loader: ({ params, context, abortController }) => {
    const threadQuery = threadDetailQuery(params.threadId);
    const artifactsQuery = artifactsByThreadQuery(params.threadId);
    abortController.signal.addEventListener(
      "abort",
      () => {
        context.queryClient.cancelQueries({
          queryKey: threadQuery.queryKey,
          exact: true,
        });
        context.queryClient.cancelQueries({
          queryKey: artifactsQuery.queryKey,
          exact: true,
        });
      },
      { once: true },
    );
    void context.queryClient.prefetchQuery(threadQuery);
    void context.queryClient.prefetchQuery(artifactsQuery);
  },
  component: ChatThreadRoute,
  pendingComponent: ChatThreadPending,
});

function ChatThreadRoute() {
  const { threadId } = Route.useParams();
  return <ChatThreadPage threadId={threadId} />;
}
