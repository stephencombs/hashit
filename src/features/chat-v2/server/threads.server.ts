import { ensureDurableChatSessionStream } from "@durable-streams/tanstack-ai-transport";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "~/db";
import { v2Threads } from "~/db/schema";
import {
  getDurableChatSessionTarget,
  isDurableStreamsConfigured,
} from "~/lib/durable-streams";
import { v2ThreadSchema, type V2Thread } from "../types";
import { buildV2ChatStreamPath } from "./keys";
import {
  isV2ThreadRunActive,
  listActiveV2ThreadRunIds,
} from "./thread-run-state.server";

const v2ThreadArraySchema = z.array(v2ThreadSchema);

type CreateV2ThreadInput = {
  id?: string;
  title?: string;
};

type SetV2ThreadPinnedInput = {
  threadId: string;
  pinned: boolean;
};

export async function listV2ThreadsServer(): Promise<Array<V2Thread>> {
  const rows = await db
    .select()
    .from(v2Threads)
    .where(isNull(v2Threads.deletedAt))
    .orderBy(
      sql`CASE WHEN ${v2Threads.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
      desc(v2Threads.updatedAt),
      desc(v2Threads.createdAt),
      desc(v2Threads.id),
    );
  const activeThreadIds = await listActiveV2ThreadRunIds();

  return v2ThreadArraySchema.parse(
    rows.map((row) => ({
      ...row,
      isStreaming: activeThreadIds.has(row.id),
    })),
  );
}

export async function getV2ThreadByIdServer(
  threadId: string,
): Promise<V2Thread> {
  const [row] = await db
    .select()
    .from(v2Threads)
    .where(eq(v2Threads.id, threadId))
    .limit(1);

  if (!row || row.deletedAt) {
    throw new Error("Thread not found");
  }

  return v2ThreadSchema.parse({
    ...row,
    isStreaming: await isV2ThreadRunActive(row.id),
  });
}

export async function createV2ThreadServer(
  input: CreateV2ThreadInput,
): Promise<V2Thread> {
  const now = new Date();
  const nextId = input.id?.trim() || `v2_${nanoid()}`;
  const nextTitle = input.title?.trim() || "Untitled";

  const row = {
    id: nextId,
    title: nextTitle,
    source: "v2-chat",
    resumeOffset: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    pinnedAt: null,
  };

  await db.insert(v2Threads).values(row);

  if (isDurableStreamsConfigured()) {
    try {
      await ensureDurableChatSessionStream(
        getDurableChatSessionTarget(buildV2ChatStreamPath(nextId)),
      );
    } catch {
      // Stream creation is best-effort during thread bootstrap.
    }
  }

  return v2ThreadSchema.parse({
    ...row,
    isStreaming: false,
  });
}

export async function setV2ThreadPinnedServer(
  input: SetV2ThreadPinnedInput,
): Promise<V2Thread> {
  const [row] = await db
    .update(v2Threads)
    .set({
      pinnedAt: input.pinned ? new Date() : null,
    })
    .where(and(eq(v2Threads.id, input.threadId), isNull(v2Threads.deletedAt)))
    .returning();

  if (!row) {
    throw new Error("Thread not found");
  }

  return v2ThreadSchema.parse({
    ...row,
    isStreaming: await isV2ThreadRunActive(row.id),
  });
}

export async function deleteV2ThreadServer(threadId: string): Promise<void> {
  const [row] = await db
    .update(v2Threads)
    .set({
      deletedAt: new Date(),
    })
    .where(and(eq(v2Threads.id, threadId), isNull(v2Threads.deletedAt)))
    .returning({ id: v2Threads.id });

  if (!row) {
    throw new Error("Thread not found");
  }
}
