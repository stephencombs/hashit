import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { v2Messages } from "~/db/schema";
import {
  isDurableStreamsConfigured,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";
import { isThreadRunActive } from "~/lib/server/thread-run-state";
import { v2MessageSchema, type V2ThreadSession } from "../types";
import { buildV2ChatStreamPath, toV2RunStateKey } from "./keys";
import {
  normalizeV2MessagesForRuntime,
  type V2RuntimeMessage,
} from "./runtime-message";
import { getV2ThreadByIdServer } from "./threads.server";

const v2MessageArraySchema = z.array(v2MessageSchema);

export async function listV2ThreadMessagesServer(
  threadId: string,
): Promise<Array<V2RuntimeMessage>> {
  const rows = await db
    .select()
    .from(v2Messages)
    .where(eq(v2Messages.threadId, threadId))
    .orderBy(asc(v2Messages.createdAt));

  return normalizeV2MessagesForRuntime(v2MessageArraySchema.parse(rows));
}

export async function hasV2MessageByIdServer(params: {
  threadId: string;
  messageId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: v2Messages.id })
    .from(v2Messages)
    .where(
      and(
        eq(v2Messages.threadId, params.threadId),
        eq(v2Messages.id, params.messageId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export async function getV2ThreadSessionServer(
  threadId: string,
): Promise<V2ThreadSession> {
  const thread = await getV2ThreadByIdServer(threadId);

  let initialResumeOffset: string | undefined =
    thread.resumeOffset ?? undefined;
  if (!initialResumeOffset && isDurableStreamsConfigured()) {
    if (isThreadRunActive(toV2RunStateKey(threadId))) {
      initialResumeOffset = "-1";
    } else {
      try {
        initialResumeOffset = await readDurableStreamHeadOffset(
          buildV2ChatStreamPath(threadId),
        );
      } catch {
        // Continue without a durable offset fallback.
      }
    }
  }

  return {
    thread,
    initialResumeOffset,
  };
}
