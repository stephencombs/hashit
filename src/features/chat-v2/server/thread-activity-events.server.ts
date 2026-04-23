import { and, asc, gt, lte, sql } from "drizzle-orm";
import { db } from "~/db";
import { v2ThreadActivityEvents } from "~/db/schema";
import type { V2ThreadActivityEventType } from "../thread-activity";

type V2ThreadActivityInsertExecutor = Pick<typeof db, "insert">;

export type V2ThreadActivityEventRecord = {
  id: number;
  threadId: string;
  eventType: V2ThreadActivityEventType;
  occurredAt: Date;
};

type ListV2ThreadActivityEventsAfterOptions = {
  afterId: number;
  limit?: number;
  upToId?: number;
};

const DEFAULT_EVENT_BATCH_SIZE = 200;

export async function appendV2ThreadActivityEvent(
  executor: V2ThreadActivityInsertExecutor,
  input: {
    threadId: string;
    eventType: V2ThreadActivityEventType;
    occurredAt: Date;
  },
): Promise<void> {
  await executor.insert(v2ThreadActivityEvents).values({
    threadId: input.threadId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
  });
}

export async function listV2ThreadActivityEventsAfter({
  afterId,
  limit = DEFAULT_EVENT_BATCH_SIZE,
  upToId,
}: ListV2ThreadActivityEventsAfterOptions): Promise<Array<V2ThreadActivityEventRecord>> {
  const safeAfterId = Number.isFinite(afterId) ? Math.max(0, afterId) : 0;
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(1, Math.trunc(limit)), 500)
    : DEFAULT_EVENT_BATCH_SIZE;

  const afterCondition = gt(v2ThreadActivityEvents.id, safeAfterId);
  const whereCondition =
    upToId == null
      ? afterCondition
      : and(afterCondition, lte(v2ThreadActivityEvents.id, upToId));

  const rows = await db
    .select({
      id: v2ThreadActivityEvents.id,
      threadId: v2ThreadActivityEvents.threadId,
      eventType: v2ThreadActivityEvents.eventType,
      occurredAt: v2ThreadActivityEvents.occurredAt,
    })
    .from(v2ThreadActivityEvents)
    .where(whereCondition)
    .orderBy(asc(v2ThreadActivityEvents.id))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    eventType: row.eventType as V2ThreadActivityEventType,
    occurredAt: row.occurredAt,
  }));
}

export async function getLatestV2ThreadActivityEventId(): Promise<number> {
  const [row] = await db
    .select({
      latestId: sql<number>`coalesce(max(${v2ThreadActivityEvents.id}), 0)`,
    })
    .from(v2ThreadActivityEvents);
  return Number(row?.latestId ?? 0);
}
