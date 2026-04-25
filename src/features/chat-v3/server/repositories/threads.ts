import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { UIMessage } from "ai";
import { z } from "zod";
import { db } from "~/db";
import { v3Threads } from "~/db/schema";
import {
  v3ThreadSchema,
  v3ThreadSummarySchema,
  type V3Thread,
  type V3ThreadSummary,
} from "../../types";

const v3ThreadSummaryArraySchema = z.array(v3ThreadSummarySchema);

export type CreateV3ThreadInput = {
  id?: string;
  title?: string;
};

export type SetV3ThreadPinnedInput = {
  threadId: string;
  pinned: boolean;
};

export type SetV3ThreadTitleInput = {
  threadId: string;
  title: string;
};

export type SaveV3ThreadMessagesInput = {
  threadId: string;
  messages: Array<UIMessage>;
  title?: string;
};

export async function listV3ThreadsRepository(): Promise<
  Array<V3ThreadSummary>
> {
  const rows = await db
    .select({
      id: v3Threads.id,
      title: v3Threads.title,
      createdAt: v3Threads.createdAt,
      updatedAt: v3Threads.updatedAt,
      deletedAt: v3Threads.deletedAt,
      pinnedAt: v3Threads.pinnedAt,
    })
    .from(v3Threads)
    .where(isNull(v3Threads.deletedAt))
    .orderBy(
      sql`CASE WHEN ${v3Threads.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
      desc(v3Threads.updatedAt),
      desc(v3Threads.createdAt),
      desc(v3Threads.id),
    );

  return v3ThreadSummaryArraySchema.parse(rows);
}

export async function getV3ThreadByIdRepository(
  threadId: string,
): Promise<V3Thread> {
  const [row] = await db
    .select()
    .from(v3Threads)
    .where(eq(v3Threads.id, threadId))
    .limit(1);

  if (!row || row.deletedAt) {
    throw new Error("Thread not found");
  }

  return v3ThreadSchema.parse(row);
}

export async function getV3ThreadByIdOrNullRepository(
  threadId: string,
): Promise<V3Thread | null> {
  const [row] = await db
    .select()
    .from(v3Threads)
    .where(eq(v3Threads.id, threadId))
    .limit(1);

  if (!row || row.deletedAt) return null;
  return v3ThreadSchema.parse(row);
}

export async function createV3ThreadRepository(
  input: CreateV3ThreadInput,
): Promise<V3Thread> {
  const now = new Date();
  const nextId = input.id?.trim() || `v3_${nanoid()}`;
  const nextTitle = input.title?.trim() || "New Chat";
  const row = {
    id: nextId,
    title: nextTitle,
    messages: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    pinnedAt: null,
  };

  await db.insert(v3Threads).values(row);
  return v3ThreadSchema.parse(row);
}

export async function setV3ThreadPinnedRepository(
  input: SetV3ThreadPinnedInput,
): Promise<V3Thread> {
  const [row] = await db
    .update(v3Threads)
    .set({
      pinnedAt: input.pinned ? new Date() : null,
    })
    .where(and(eq(v3Threads.id, input.threadId), isNull(v3Threads.deletedAt)))
    .returning();

  if (!row) {
    throw new Error("Thread not found");
  }

  return v3ThreadSchema.parse(row);
}

export async function setV3ThreadTitleRepository(
  input: SetV3ThreadTitleInput,
): Promise<V3Thread> {
  const nextTitle = input.title.trim();
  if (!nextTitle) {
    throw new Error("Thread title is required");
  }

  const [row] = await db
    .update(v3Threads)
    .set({
      title: nextTitle,
      updatedAt: new Date(),
    })
    .where(and(eq(v3Threads.id, input.threadId), isNull(v3Threads.deletedAt)))
    .returning();

  if (!row) {
    throw new Error("Thread not found");
  }

  return v3ThreadSchema.parse(row);
}

export async function saveV3ThreadMessagesRepository(
  input: SaveV3ThreadMessagesInput,
): Promise<V3Thread> {
  const update = {
    messages: input.messages,
    updatedAt: new Date(),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
  };

  const [row] = await db
    .update(v3Threads)
    .set(update)
    .where(and(eq(v3Threads.id, input.threadId), isNull(v3Threads.deletedAt)))
    .returning();

  if (!row) {
    throw new Error("Thread not found");
  }

  return v3ThreadSchema.parse(row);
}

export async function deleteV3ThreadRepository(
  threadId: string,
): Promise<void> {
  const [row] = await db
    .update(v3Threads)
    .set({
      deletedAt: new Date(),
    })
    .where(and(eq(v3Threads.id, threadId), isNull(v3Threads.deletedAt)))
    .returning({ id: v3Threads.id });

  if (!row) {
    throw new Error("Thread not found");
  }
}
