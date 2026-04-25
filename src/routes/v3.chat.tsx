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
  v3ThreadListQueryOptions,
  v3ThreadSessionQueryOptions,
} from "~/features/chat-v3/data/query-options";
import { V3ChatThreadPage } from "~/features/chat-v3/ui/v3-chat-thread-page";

function getNewChatNavNonce(state: unknown): number | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as { __newV3ChatNavNonce?: unknown })
    .__newV3ChatNavNonce;
  return typeof value === "number" ? value : undefined;
}

export const Route = createFileRoute("/v3/chat")({
  component: V3ChatRoute,
});

function V3ChatRoute() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draftThreadId, setDraftThreadId] = useState(() => `v3_${nanoid(12)}`);
  const threadMatch = useMatch({
    from: "/v3/chat/$threadId",
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
    setDraftThreadId(`v3_${nanoid(12)}`);
  }, [newChatNavNonce, threadId]);

  const handleThreadReady = useCallback(
    async (nextThreadId: string) => {
      await queryClient.ensureQueryData(
        v3ThreadSessionQueryOptions(nextThreadId),
      );
      await queryClient.invalidateQueries({
        queryKey: v3ThreadListQueryOptions.queryKey,
      });

      await navigate({
        to: "/v3/chat/$threadId",
        params: { threadId: nextThreadId },
        replace: true,
      });

      setDraftThreadId(`v3_${nanoid(12)}`);
    },
    [navigate, queryClient],
  );

  return (
    <V3ChatThreadPage
      threadId={threadId}
      draftThreadId={draftThreadId}
      onThreadReady={handleThreadReady}
    />
  );
}
