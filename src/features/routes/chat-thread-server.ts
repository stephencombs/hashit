import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { messages, threads } from "~/db/schema";
import {
  buildChatStreamPath,
  isDurableStreamsConfigured,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";
import { isThreadRunActive } from "~/lib/server/thread-run-state";

export const getThread = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(z.string()))
  .handler(async ({ data: threadId }) => {
    const [[thread], threadMessages] = await Promise.all([
      db.select().from(threads).where(eq(threads.id, threadId)).limit(1),
      db
        .select()
        .from(messages)
        .where(eq(messages.threadId, threadId))
        .orderBy(asc(messages.createdAt)),
    ]);

    if (!thread) {
      throw new Error("Thread not found");
    }

    let initialResumeOffset: string | undefined =
      thread.resumeOffset ?? undefined;
    if (!initialResumeOffset && isDurableStreamsConfigured()) {
      if (isThreadRunActive(threadId)) {
        // While a run is actively streaming, avoid tail-based head fallback.
        // Starting from "-1" guarantees replay from the beginning of the
        // active run instead of mid-stream truncation.
        initialResumeOffset = "-1";
      } else {
        try {
          initialResumeOffset = await readDurableStreamHeadOffset(
            buildChatStreamPath(threadId),
          );
        } catch {
          // Fall back to Postgres-only hydration if the durable stream is unavailable.
        }
      }
    }

    return {
      ...thread,
      messages: threadMessages,
      initialResumeOffset,
    } as any;
  });
