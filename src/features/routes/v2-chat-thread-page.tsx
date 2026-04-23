import { useQuery } from "@tanstack/react-query";
import { AppPageHeader } from "~/components/app-page-header";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "~/features/chat-v2/data/query-options";
import { V2ChatSurface } from "~/features/chat-v2/ui/v2-chat-surface";

type V2ChatThreadPageProps = {
  threadId?: string;
  draftThreadId: string;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

export function V2ChatThreadPage({
  threadId,
  draftThreadId,
  onThreadReady,
}: V2ChatThreadPageProps) {
  const sessionQuery = useQuery({
    ...v2ThreadSessionQueryOptions(threadId ?? "__draft__"),
    enabled: Boolean(threadId),
  });
  const messagesQuery = useQuery({
    ...v2ThreadMessagesQueryOptions(threadId ?? "__draft__"),
    enabled: Boolean(threadId),
  });

  const isExistingThread = Boolean(threadId);
  const isThreadLoading =
    isExistingThread && (sessionQuery.isLoading || messagesQuery.isLoading);
  const title = threadId
    ? (sessionQuery.data?.thread.title ?? "Loading thread...")
    : "New Thread";
  const initialResumeOffset = threadId
    ? sessionQuery.data?.initialResumeOffset
    : undefined;
  const initialMessages = threadId ? (messagesQuery.data ?? []) : [];
  const surfaceThreadId = threadId ?? draftThreadId;

  return (
    <>
      <AppPageHeader title={<h1 className="text-sm font-medium">{title}</h1>} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isThreadLoading ? (
          <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-sm">
            Loading thread...
          </div>
        ) : (
          <V2ChatSurface
            threadId={surfaceThreadId}
            initialResumeOffset={initialResumeOffset}
            initialMessages={initialMessages}
            isDraftThread={!threadId}
            onThreadReady={onThreadReady}
          />
        )}
      </div>
    </>
  );
}
