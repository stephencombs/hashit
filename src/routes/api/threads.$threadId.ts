import { createFileRoute } from "@tanstack/react-router";
import { listV2ThreadMessagesServer } from "~/features/chat-v2/server/messages.server";
import {
  deleteV2ThreadServer,
  getV2ThreadByIdServer,
  setV2ThreadPinnedServer,
  setV2ThreadTitleServer,
} from "~/features/chat-v2/server/threads.server";

export const Route = createFileRoute("/api/threads/$threadId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { threadId } = params;

        try {
          const [thread, threadMessages] = await Promise.all([
            getV2ThreadByIdServer(threadId),
            listV2ThreadMessagesServer(threadId),
          ]);
          return Response.json({ ...thread, messages: threadMessages });
        } catch {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }
      },

      PATCH: async ({ params, request }) => {
        const { threadId } = params;
        const body = (await request.json()) as {
          pinned?: boolean;
          title?: string;
        };
        if (body.pinned !== undefined) {
          await setV2ThreadPinnedServer({
            threadId,
            pinned: body.pinned,
          });
        }
        if (body.title !== undefined) {
          await setV2ThreadTitleServer({
            threadId,
            title: body.title,
          });
        }
        return Response.json({ ok: true });
      },

      DELETE: async ({ params }) => {
        const { threadId } = params;
        await deleteV2ThreadServer(threadId);
        return new Response(null, { status: 204 });
      },
    },
  },
});
