import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { AppPageHeader } from "~/app/components/app-page-header";
import { commitV3ThreadTitle, setV3ThreadTitle } from "../data/mutations";
import { v3ThreadSessionQueryOptions } from "../data/query-options";
import { V3ChatSurface } from "./v3-chat-surface";

type V3ChatThreadPageProps = {
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

function EditableV3ThreadTitle({
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
    setV3ThreadTitle(queryClient, threadId, nextTitle);

    try {
      const saveTitle = commitV3ThreadTitle(queryClient, threadId, nextTitle);
      toast.promise(saveTitle, {
        loading: "Saving thread title...",
        success: "Thread title updated.",
        error: (error) => {
          setV3ThreadTitle(queryClient, threadId, previousTitle);
          heading.textContent = previousTitle;
          return toRenameErrorMessage(error);
        },
      });
      await saveTitle;
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

export function V3ChatThreadPage({
  threadId,
  draftThreadId,
  onThreadReady,
}: V3ChatThreadPageProps) {
  const sessionQuery = useQuery({
    ...v3ThreadSessionQueryOptions(threadId ?? "__draft__"),
    enabled: Boolean(threadId),
  });

  const isExistingThread = Boolean(threadId);
  const isThreadLoading = isExistingThread && sessionQuery.isLoading;
  const title = threadId
    ? (sessionQuery.data?.title ?? "Loading thread...")
    : "New Thread";
  const initialMessages = threadId ? (sessionQuery.data?.messages ?? []) : [];
  const surfaceThreadId = threadId ?? draftThreadId;

  return (
    <>
      <AppPageHeader
        title={
          threadId ? (
            <EditableV3ThreadTitle threadId={threadId} title={title} />
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
          <V3ChatSurface
            key={surfaceThreadId}
            threadId={surfaceThreadId}
            initialMessages={initialMessages}
            isDraftThread={!threadId}
            onThreadReady={onThreadReady}
          />
        )}
      </div>
    </>
  );
}
