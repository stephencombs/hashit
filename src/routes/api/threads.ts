import { createFileRoute } from "@tanstack/react-router";
import { ensureDurableChatSessionStream } from "@durable-streams/tanstack-ai-transport";
import { db } from "~/db";
import { threads } from "~/db/schema";
import { desc, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createThreadBodySchema } from "~/lib/schemas";
import {
  buildChatStreamPath,
  getDurableChatSessionTarget,
  isDurableStreamsConfigured,
} from "~/lib/durable-streams";

export const Route = createFileRoute("/api/threads")({
  server: {
    handlers: {
      GET: async () => {
        const allThreads = await db
          .select()
          .from(threads)
          .where(isNull(threads.deletedAt))
          .orderBy(
            sql`CASE WHEN ${threads.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
            desc(threads.updatedAt),
          );

        return Response.json(allThreads);
      },

      POST: async ({ request }) => {
        const { id, title } = createThreadBodySchema.parse(
          await request.json(),
        );
        const now = new Date();

        const thread = {
          id: id || nanoid(),
          title: title || "Untitled",
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(threads).values(thread);

        // Pre-create the durable session stream so the client's durable
        // connection can subscribe immediately with a stable id. Idempotent.
        if (isDurableStreamsConfigured()) {
          try {
            await ensureDurableChatSessionStream(
              getDurableChatSessionTarget(buildChatStreamPath(thread.id)),
            );
          } catch (err) {
            console.error(
              "[threads] ensureDurableChatSessionStream failed",
              err,
            );
          }
        }

        return Response.json(thread, { status: 201 });
      },
    },
  },
});
