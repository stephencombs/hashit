import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useLocation,
  useMatch,
  useNavigate,
} from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "~/features/chat-v2/data/query-options";
import { V2ChatThreadPage } from "~/features/chat-v2/ui/v2-chat-thread-page";

function getNewChatNavNonce(state: unknown): number | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as { __newV2ChatNavNonce?: unknown })
    .__newV2ChatNavNonce;
  return typeof value === "number" ? value : undefined;
}

export const Route = createFileRoute("/v2/chat")({
  component: V2ChatRoute,
});

function V2ChatRoute() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draftThreadId, setDraftThreadId] = useState(() => `v2_${nanoid(12)}`);
  const threadMatch = useMatch({
    from: "/v2/chat/$threadId",
    shouldThrow: false,
  });
  const threadId = threadMatch?.params.threadId;
  const newChatNavNonce = useMemo(
    () => getNewChatNavNonce(location.state),
    [location.state],
  );

  useEffect(() => {
    if (threadId) return;
    if (newChatNavNonce === undefined) return;
    setDraftThreadId(`v2_${nanoid(12)}`);
  }, [newChatNavNonce, threadId]);

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
