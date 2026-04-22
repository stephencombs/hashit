import { PlusIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@tanstack/react-db";
import { Link, useLocation, useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { getV2Collections } from "../data/collections";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "../data/query-options";
import type { V2Thread } from "../types";

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

export function V2ThreadList() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const matchRoute = useMatchRoute();
  const { threadsCollection } = useMemo(() => getV2Collections(queryClient), [queryClient]);

  const { data: rawThreads = [], isLoading } = useLiveQuery((query) =>
    query.from({ threads: threadsCollection }).select(({ threads }) => threads),
  );
  const threads = useMemo(() => sortThreads(rawThreads), [rawThreads]);
  const normalizedPath =
    location.pathname.length > 1
      ? location.pathname.replace(/\/+$/, "")
      : location.pathname;
  const isNewThreadActive = normalizedPath === "/v2/chat";

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Threads</SidebarGroupLabel>
      <SidebarGroupContent className="space-y-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={isNewThreadActive} asChild>
              <Link to="/v2/chat" activeOptions={{ exact: true }}>
                <PlusIcon className="size-4" />
                <span>New Thread</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {isLoading ? (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground">Loading...</div>
            </SidebarMenuItem>
          ) : null}

          {!isLoading && threads.length === 0 ? (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground">
                No threads yet.
              </div>
            </SidebarMenuItem>
          ) : null}

          {threads.map((thread) => {
            const isActive = Boolean(
              matchRoute({
                to: "/v2/chat/$threadId",
                params: { threadId: thread.id },
              }),
            );

            const isStreaming = Boolean(thread.isStreaming);

            return (
              <SidebarMenuItem key={thread.id}>
                <SidebarMenuButton isActive={isActive} asChild>
                  <Link
                    to="/v2/chat/$threadId"
                    params={{ threadId: thread.id }}
                    onMouseEnter={() => {
                      void queryClient.prefetchQuery(
                        v2ThreadSessionQueryOptions(thread.id),
                      );
                      void queryClient.prefetchQuery(
                        v2ThreadMessagesQueryOptions(thread.id),
                      );
                    }}
                    onFocus={() => {
                      void queryClient.prefetchQuery(
                        v2ThreadSessionQueryOptions(thread.id),
                      );
                      void queryClient.prefetchQuery(
                        v2ThreadMessagesQueryOptions(thread.id),
                      );
                    }}
                  >
                    <span className="truncate">{thread.title}</span>
                    {isStreaming ? (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" />
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
