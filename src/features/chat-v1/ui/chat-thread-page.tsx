import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Chat } from "~/features/chat-v1/ui/chat";
import { AppPageHeader } from "~/app/components/app-page-header";
import { threadDetailQuery } from "~/features/chat-v1/data/queries";

export function ChatThreadPending() {
  return <AppPageHeader title="Loading thread..." />;
}

function EditableTitle({
  threadId,
  title,
}: {
  threadId: string;
  title: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();

  const rename = useMutation({
    mutationFn: async (newTitle: string) => {
      const response = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) {
        throw new Error(`Failed to rename thread (${response.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({
        queryKey: threadDetailQuery(threadId).queryKey,
      });
    },
  });

  const commit = useCallback(() => {
    const heading = ref.current;
    setEditing(false);
    if (!heading) return;
    const newTitle = heading.textContent?.trim() ?? "";
    if (newTitle && newTitle !== title) {
      rename.mutate(newTitle);
    } else {
      heading.textContent = title;
    }
  }, [rename, title]);

  return (
    <h1
      ref={ref}
      className={`text-sm font-medium ${editing ? "border-input ring-ring rounded border px-1 ring-1 outline-none" : "cursor-text"}`}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={() => {
        if (editing) return;
        setEditing(true);
        requestAnimationFrame(() => {
          const heading = ref.current;
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
        if (editing) commit();
      }}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          const heading = ref.current;
          if (heading) heading.textContent = title;
          setEditing(false);
          heading?.blur();
        }
      }}
    >
      {title}
    </h1>
  );
}

export function ChatThreadPage({ threadId }: { threadId: string }) {
  const { data: thread, isPending } = useQuery(threadDetailQuery(threadId)) as {
    data: {
      id: string;
      title: string;
      initialResumeOffset?: string;
      messages: Array<{
        id: string;
        role: string;
        content?: string | null;
        parts?: any[] | null;
      }>;
    };
    isPending: boolean;
  };

  if (isPending || !thread) {
    return <ChatThreadPending />;
  }

  const initialMessages = thread.messages.map(
    (message: (typeof thread.messages)[number]) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      parts:
        message.parts && message.parts.length > 0
          ? message.parts
          : [{ type: "text" as const, content: message.content ?? "" }],
    }),
  );

  return (
    <>
      <AppPageHeader
        title={<EditableTitle threadId={thread.id} title={thread.title} />}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chat
          key={`thread-${threadId}`}
          threadId={thread.id}
          initialMessages={initialMessages}
          initialResumeOffset={thread.initialResumeOffset}
        />
      </div>
    </>
  );
}
