import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "~/db";
import { v2ThreadRuns } from "~/db/schema";
import {
  v2ThreadRunFinishedEvent,
  v2ThreadRunStartedEvent,
} from "../thread-activity";
import { appendV2ThreadActivityEvent } from "./thread-activity-events.server";

export type V2ThreadRunTransition = {
  threadId: string;
  runCount: number;
  at: Date;
  becameActive: boolean;
  becameInactive: boolean;
};

function noTransition(threadId: string): V2ThreadRunTransition {
  return {
    threadId,
    runCount: 0,
    at: new Date(),
    becameActive: false,
    becameInactive: false,
  };
}

export async function beginV2ThreadRun(
  threadId: string,
): Promise<V2ThreadRunTransition> {
  if (!threadId) return noTransition(threadId);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .insert(v2ThreadRuns)
      .values({
        threadId,
        runCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: v2ThreadRuns.threadId,
        set: {
          runCount: sql`${v2ThreadRuns.runCount} + 1`,
          updatedAt: now,
        },
      })
      .returning({
        runCount: v2ThreadRuns.runCount,
      });
    const runCount = updated?.runCount ?? 0;
    const becameActive = runCount === 1;
    if (becameActive) {
      await appendV2ThreadActivityEvent(tx, {
        threadId,
        eventType: v2ThreadRunStartedEvent,
        occurredAt: now,
      });
    }
    return {
      threadId,
      runCount,
      at: now,
      becameActive,
      becameInactive: false,
    };
  });
}

export async function endV2ThreadRun(
  threadId: string,
): Promise<V2ThreadRunTransition> {
  if (!threadId) return noTransition(threadId);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [decremented] = await tx
      .update(v2ThreadRuns)
      .set({
        runCount: sql`${v2ThreadRuns.runCount} - 1`,
        updatedAt: now,
      })
      .where(and(eq(v2ThreadRuns.threadId, threadId), gt(v2ThreadRuns.runCount, 1)))
      .returning({
        runCount: v2ThreadRuns.runCount,
      });

    if (decremented) {
      return {
        threadId,
        runCount: decremented.runCount,
        at: now,
        becameActive: false,
        becameInactive: false,
      };
    }

    const [deleted] = await tx
      .delete(v2ThreadRuns)
      .where(and(eq(v2ThreadRuns.threadId, threadId), eq(v2ThreadRuns.runCount, 1)))
      .returning({ threadId: v2ThreadRuns.threadId });

    if (deleted) {
      await appendV2ThreadActivityEvent(tx, {
        threadId,
        eventType: v2ThreadRunFinishedEvent,
        occurredAt: now,
      });
      return {
        threadId,
        runCount: 0,
        at: now,
        becameActive: false,
        becameInactive: true,
      };
    }

    const [existing] = await tx
      .select({ runCount: v2ThreadRuns.runCount })
      .from(v2ThreadRuns)
      .where(eq(v2ThreadRuns.threadId, threadId))
      .limit(1);

    return {
      threadId,
      runCount: existing?.runCount ?? 0,
      at: now,
      becameActive: false,
      becameInactive: false,
    };
  });
}

export async function isV2ThreadRunActive(threadId: string): Promise<boolean> {
  if (!threadId) return false;
  const [row] = await db
    .select({ threadId: v2ThreadRuns.threadId })
    .from(v2ThreadRuns)
    .where(and(eq(v2ThreadRuns.threadId, threadId), gt(v2ThreadRuns.runCount, 0)))
    .limit(1);
  return Boolean(row);
}

export async function listActiveV2ThreadRunIds(): Promise<Set<string>> {
  const rows = await db
    .select({ threadId: v2ThreadRuns.threadId })
    .from(v2ThreadRuns)
    .where(gt(v2ThreadRuns.runCount, 0));
  return new Set(rows.map((row) => row.threadId));
}
