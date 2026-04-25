import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppPageHeader } from "~/components/app-page-header";
import {
  commitV2ThreadTitle,
  setV2ThreadTitle,
} from "~/features/chat-v2/data/mutations";
import {
  v2ThreadAttachmentSummaryQueryOptions,
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "~/features/chat-v2/data/query-options";
import { V2ChatSurface } from "~/features/chat-v2/ui/v2-chat-surface";

type V2ChatThreadPageProps = {
  threadId?: string;
  draftThreadId: string;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

function toRenameErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unable to update thread title.";
}

function EditableV2ThreadTitle({
  threadId,
  title,
}: {
  threadId: string;
  title: string;
}) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const commit = useCallback(async () => {
    const heading = headingRef.current;
    setEditing(false);
    if (!heading) return;

    const previousTitle = title;
    const nextTitle = heading.textContent?.trim() ?? "";
    if (!nextTitle) {
      heading.textContent = previousTitle;
      toast.error("Thread title is required.");
      return;
    }

    if (nextTitle === previousTitle) {
      heading.textContent = previousTitle;
      return;
    }

    setIsSaving(true);
    setV2ThreadTitle(queryClient, threadId, nextTitle);

    try {
      await toast.promise(
        commitV2ThreadTitle(queryClient, threadId, nextTitle),
        {
          loading: "Saving thread title...",
          success: "Thread title updated.",
          error: (error) => {
            setV2ThreadTitle(queryClient, threadId, previousTitle);
            heading.textContent = previousTitle;
            return toRenameErrorMessage(error);
          },
        },
      );
    } catch {
      // Error handling is centralized in toast.promise above.
    } finally {
      setIsSaving(false);
    }
  }, [queryClient, threadId, title]);

  return (
    <div className="min-w-0">
      <h1
        ref={headingRef}
        className={`truncate text-sm font-medium ${
          editing
            ? "border-input ring-ring rounded border px-1 ring-1 outline-none"
            : "cursor-text"
        } ${isSaving ? "opacity-70" : ""}`}
        contentEditable={editing && !isSaving}
        suppressContentEditableWarning
        onDoubleClick={() => {
          if (editing || isSaving) return;
          setEditing(true);
          requestAnimationFrame(() => {
            const heading = headingRef.current;
            if (!heading) return;
            heading.focus();
            const range = document.createRange();
            range.selectNodeContents(heading);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          });
        }}
        onBlur={() => {
          if (editing) {
            void commit();
          }
        }}
        onKeyDown={(event) => {
          if (!editing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            const heading = headingRef.current;
            if (heading) heading.textContent = title;
            setEditing(false);
            heading?.blur();
          }
        }}
      >
        {title}
      </h1>
    </div>
  );
}

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
  const attachmentSummaryQuery = useQuery({
    ...v2ThreadAttachmentSummaryQueryOptions(threadId ?? "__draft__"),
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
  const attachmentSummaryRenderable = threadId
    ? ((attachmentSummaryQuery.data as { Renderable?: ReactNode } | undefined)
        ?.Renderable ?? null)
    : null;

  return (
    <>
      <AppPageHeader
        title={
          threadId ? (
            <EditableV2ThreadTitle threadId={threadId} title={title} />
          ) : (
            <h1 className="text-sm font-medium">{title}</h1>
          )
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isThreadLoading ? (
          <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-sm">
            Loading thread...
          </div>
        ) : (
          <>
            {attachmentSummaryRenderable ?? null}
            <V2ChatSurface
              threadId={surfaceThreadId}
              initialResumeOffset={initialResumeOffset}
              initialMessages={initialMessages}
              isDraftThread={!threadId}
              onThreadReady={onThreadReady}
            />
          </>
        )}
      </div>
    </>
  );
}
