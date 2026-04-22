import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useCallback, useMemo, useState } from "react";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "~/features/chat-v2/data/query-options";
import { V2ChatThreadPage } from "~/features/routes/v2-chat-thread-page";

function getThreadIdFromPathname(pathname: string): string | undefined {
  const threadMatch = /^\/v2\/chat\/([^/]+)$/.exec(pathname);
  if (!threadMatch) return undefined;
  return decodeURIComponent(threadMatch[1]);
}

export const Route = createFileRoute("/v2/chat")({
  component: V2ChatRoute,
});

function V2ChatRoute() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draftThreadId, setDraftThreadId] = useState(() => `v2_${nanoid(12)}`);

  const threadId = useMemo(
    () => getThreadIdFromPathname(location.pathname),
    [location.pathname],
  );

  const handleThreadReady = useCallback(
    async (nextThreadId: string) => {
      await Promise.all([
        queryClient.ensureQueryData(v2ThreadSessionQueryOptions(nextThreadId)),
        queryClient.ensureQueryData(v2ThreadMessagesQueryOptions(nextThreadId)),
      ]);

      await navigate({
        to: "/v2/chat/$threadId",
        params: { threadId: nextThreadId },
        replace: true,
      });

      // Prepare the next draft id for future `/v2/chat` sessions.
      setDraftThreadId(`v2_${nanoid(12)}`);
    },
    [navigate, queryClient],
  );

  return (
    <V2ChatThreadPage
      threadId={threadId}
      draftThreadId={draftThreadId}
      onThreadReady={handleThreadReady}
    />
  );
}
