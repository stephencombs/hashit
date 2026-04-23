import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import {
  Link,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type MouseEvent,
  useMemo,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  commitV2ThreadDelete,
  commitV2ThreadPinnedState,
  removeV2ThreadOptimistically,
  restoreDeletedV2Thread,
  restoreV2ThreadPinnedState,
  setV2ThreadPinnedOptimistically,
} from "../data/mutations";
import { getV2Collections } from "../data/collections";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "../data/query-options";
import type { V2Thread } from "../types";

const SIDEBAR_ROW_HIT_AREA_CLASS_NAME = "overflow-visible hit-area-y-0.5";
const THREAD_ACTIONS_CLIP_CLASS_NAME =
  "absolute inset-y-0 right-0 z-[1] w-[6.5rem] overflow-hidden group-data-[collapsible=icon]:hidden";
const THREAD_ACTIONS_PANEL_CLASS_NAME =
  "absolute inset-0 flex translate-x-full items-center justify-end gap-1 pr-2 pl-6 bg-gradient-to-r from-transparent to-sidebar to-35% transition-transform duration-150 ease-out group-hover/menu-item:translate-x-0";
const THREAD_ACTION_BUTTON_CLASS_NAME =
  "flex size-7 items-center justify-center rounded-md text-sidebar-foreground ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60";
const THREAD_DELETE_BUTTON_CLASS_NAME =
  "text-destructive hover:bg-destructive/10 hover:text-destructive";

function toTimestamp(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

function sortThreads(rows: Array<V2Thread>): Array<V2Thread> {
  return [...rows].sort((left, right) => {
    const leftPinned = Boolean(left.pinnedAt);
    const rightPinned = Boolean(right.pinnedAt);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
  });
}

function SidebarSkeletonGroup({ widths }: { widths: string[] }) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <div className="flex h-8 shrink-0 items-center rounded-md px-2">
        <Skeleton className="h-3 w-14" />
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {widths.map((width, index) => (
            <SidebarMenuItem key={index}>
              <div className="flex h-8 w-full items-center rounded-md p-2">
                <Skeleton className={`h-3.5 ${width}`} />
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarListSkeleton() {
  return (
    <>
      <SidebarSkeletonGroup widths={["w-3/5", "w-1/2"]} />
      <SidebarSkeletonGroup widths={["w-3/4", "w-2/3", "w-4/5", "w-1/2"]} />
    </>
  );
}

function formatThreadActionError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

function handleThreadActionClick(
  event: MouseEvent<HTMLButtonElement>,
  onPress: () => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
  onPress();
}

type ThreadHoverActionsProps = {
  thread: V2Thread;
  isPinPending: boolean;
  isDeletePending: boolean;
  onTogglePin: (thread: V2Thread) => void;
  onRequestDelete: (thread: V2Thread) => void;
};

function ThreadHoverActions({
  thread,
  isPinPending,
  isDeletePending,
  onTogglePin,
  onRequestDelete,
}: ThreadHoverActionsProps) {
  const isActionPending = isPinPending || isDeletePending;
  const pinLabel = thread.pinnedAt ? "Unpin thread" : "Pin thread";

  return (
    <div className={THREAD_ACTIONS_CLIP_CLASS_NAME}>
      <div className={THREAD_ACTIONS_PANEL_CLASS_NAME}>
        <button
          type="button"
          aria-label={pinLabel}
          title={pinLabel}
          className={THREAD_ACTION_BUTTON_CLASS_NAME}
          disabled={isActionPending}
          onClick={(event) =>
            handleThreadActionClick(event, () => onTogglePin(thread))
          }
        >
          {isPinPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : thread.pinnedAt ? (
            <PinOffIcon className="size-4" />
          ) : (
            <PinIcon className="size-4" />
          )}
        </button>

        <button
          type="button"
          aria-label="Delete thread"
          title="Delete thread"
          className={`${THREAD_ACTION_BUTTON_CLASS_NAME} ${THREAD_DELETE_BUTTON_CLASS_NAME}`}
          disabled={isActionPending}
          onClick={(event) =>
            handleThreadActionClick(event, () => onRequestDelete(thread))
          }
        >
          {isDeletePending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <Trash2Icon className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

type ThreadGroupProps = {
  label: string;
  threads: Array<V2Thread>;
  onPrefetch: (threadId: string) => void;
  pendingPinIds: ReadonlySet<string>;
  pendingDeleteId: string | null;
  onTogglePin: (thread: V2Thread) => void;
  onRequestDelete: (thread: V2Thread) => void;
};

function ThreadGroup({
  label,
  threads,
  onPrefetch,
  pendingPinIds,
  pendingDeleteId,
  onTogglePin,
  onRequestDelete,
}: ThreadGroupProps) {
  const matchRoute = useMatchRoute();

  if (threads.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {threads.map((thread) => {
            const isActive = Boolean(
              matchRoute({
                to: "/v2/chat/$threadId",
                params: { threadId: thread.id },
              }),
            );
            const isPinPending = pendingPinIds.has(thread.id);
            const isDeletePending = pendingDeleteId === thread.id;

            return (
              <SidebarMenuItem key={thread.id}>
                <SidebarMenuButton
                  isActive={isActive}
                  asChild
                  className={`${SIDEBAR_ROW_HIT_AREA_CLASS_NAME} pr-16`}
                >
                  <Link
                    to="/v2/chat/$threadId"
                    params={{ threadId: thread.id }}
                    onMouseEnter={() => onPrefetch(thread.id)}
                    onFocus={() => onPrefetch(thread.id)}
                    draggable={false}
                  >
                    <span className="truncate">{thread.title}</span>
                    {thread.isStreaming ? (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" />
                    ) : null}
                  </Link>
                </SidebarMenuButton>
                <ThreadHoverActions
                  thread={thread}
                  isPinPending={isPinPending}
                  isDeletePending={isDeletePending}
                  onTogglePin={onTogglePin}
                  onRequestDelete={onRequestDelete}
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function V2ThreadList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const { threadsCollection } = useMemo(() => getV2Collections(queryClient), [queryClient]);
  const [pendingPinIds, setPendingPinIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<V2Thread | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: rawThreads = [], isLoading } = useLiveQuery((query) =>
    query.from({ threads: threadsCollection }).select(({ threads }) => threads),
  );
  const threads = useMemo(() => sortThreads(rawThreads), [rawThreads]);

  const { pinned, recents } = useMemo(() => {
    const pinned: Array<V2Thread> = [];
    const recents: Array<V2Thread> = [];

    for (const thread of threads) {
      if (thread.pinnedAt) pinned.push(thread);
      else recents.push(thread);
    }

    return { pinned, recents };
  }, [threads]);

  function prefetchThread(threadId: string) {
    void queryClient.prefetchQuery(v2ThreadSessionQueryOptions(threadId));
    void queryClient.prefetchQuery(v2ThreadMessagesQueryOptions(threadId));
  }

  function setPinPending(threadId: string, isPending: boolean) {
    setPendingPinIds((previous) => {
      const next = new Set(previous);
      if (isPending) {
        next.add(threadId);
      } else {
        next.delete(threadId);
      }
      return next;
    });
  }

  async function handleTogglePin(thread: V2Thread) {
    if (pendingDeleteId === thread.id) return;

    const nextPinned = !Boolean(thread.pinnedAt);
    const previousPinnedAt = thread.pinnedAt ? new Date(thread.pinnedAt) : null;

    setActionError(null);
    setPinPending(thread.id, true);
    setV2ThreadPinnedOptimistically(queryClient, thread.id, nextPinned);

    try {
      await commitV2ThreadPinnedState(queryClient, thread.id, nextPinned);
    } catch (error) {
      restoreV2ThreadPinnedState(queryClient, thread.id, previousPinnedAt);
      setActionError(
        formatThreadActionError(error, "Unable to update thread pin state."),
      );
    } finally {
      setPinPending(thread.id, false);
    }
  }

  function handleRequestDelete(thread: V2Thread) {
    setActionError(null);
    setDeleteCandidate(thread);
  }

  async function handleConfirmDelete() {
    const thread = deleteCandidate;
    if (!thread) return;

    setActionError(null);
    setPendingDeleteId(thread.id);
    removeV2ThreadOptimistically(queryClient, thread.id);

    try {
      await commitV2ThreadDelete(queryClient, thread.id);
      queryClient.removeQueries({
        queryKey: v2ThreadSessionQueryOptions(thread.id).queryKey,
      });
      queryClient.removeQueries({
        queryKey: v2ThreadMessagesQueryOptions(thread.id).queryKey,
      });

      const wasActive = Boolean(
        matchRoute({
          to: "/v2/chat/$threadId",
          params: { threadId: thread.id },
        }),
      );
      if (wasActive) {
        await navigate({
          to: "/v2/chat",
          replace: true,
          state: (previous) => ({
            ...(previous ?? {}),
            __newV2ChatNavNonce: Date.now(),
          }),
        });
      }

      setDeleteCandidate(null);
    } catch (error) {
      restoreDeletedV2Thread(queryClient, thread);
      setActionError(
        formatThreadActionError(error, "Unable to delete thread."),
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  if (isLoading) return <SidebarListSkeleton />;

  if (threads.length === 0) {
    return (
      <>
        {actionError ? (
          <div className="px-4 pt-2 text-xs text-destructive group-data-[collapsible=icon]:hidden">
            {actionError}
          </div>
        ) : null}
        <div className="p-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
          No threads yet
        </div>
      </>
    );
  }

  return (
    <>
      {actionError ? (
        <div className="px-4 pt-2 text-xs text-destructive group-data-[collapsible=icon]:hidden">
          {actionError}
        </div>
      ) : null}

      <ThreadGroup
        label="Pinned"
        threads={pinned}
        onPrefetch={prefetchThread}
        pendingPinIds={pendingPinIds}
        pendingDeleteId={pendingDeleteId}
        onTogglePin={handleTogglePin}
        onRequestDelete={handleRequestDelete}
      />
      <ThreadGroup
        label="Recents"
        threads={recents}
        onPrefetch={prefetchThread}
        pendingPinIds={pendingPinIds}
        pendingDeleteId={pendingDeleteId}
        onTogglePin={handleTogglePin}
        onRequestDelete={handleRequestDelete}
      />

      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (open) return;
          if (pendingDeleteId) return;
          setDeleteCandidate(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete thread?</DialogTitle>
            <DialogDescription>
              This removes &quot;{deleteCandidate?.title ?? "thread"}&quot; from the
              V2 sidebar and hides it from future runs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={Boolean(pendingDeleteId)}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(pendingDeleteId)}
              onClick={() => {
                void handleConfirmDelete();
              }}
            >
              {pendingDeleteId ? "Deleting..." : "Delete thread"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
