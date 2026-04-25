import { createServerFn } from "@tanstack/react-start";
import { desc, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { threads } from "~/db/schema";
import { isThreadRunActive } from "~/features/chat-v1/server/thread-run-state";

export const listThreads = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await db
      .select()
      .from(threads)
      .where(isNull(threads.deletedAt))
      .orderBy(
        sql`CASE WHEN ${threads.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
        desc(threads.updatedAt),
        desc(threads.createdAt),
        desc(threads.id),
      );
    return rows.map((row) => ({
      ...row,
      isStreaming: isThreadRunActive(row.id),
    }));
  },
);
