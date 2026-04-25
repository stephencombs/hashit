import { createFileRoute } from "@tanstack/react-router";
import {
  createV2ThreadServer,
  listV2ThreadsServer,
} from "~/features/chat-v2/server/threads.server";
import { z } from "zod";

const createThreadBodySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
});

export const Route = createFileRoute("/api/threads")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(await listV2ThreadsServer());
      },

      POST: async ({ request }) => {
        const { id, title } = createThreadBodySchema.parse(
          await request.json(),
        );
        const thread = await createV2ThreadServer({ id, title });
        return Response.json(thread, { status: 201 });
      },
    },
  },
});
