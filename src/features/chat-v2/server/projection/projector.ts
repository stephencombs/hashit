import { materializeSnapshotFromDurableStream } from "@durable-streams/tanstack-ai-transport";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { v2Messages, v2Threads } from "~/db/schema";
import {
  buildReadStreamUrl,
  getDurableReadHeaders,
  readDurableStreamHeadOffset,
} from "~/shared/lib/durable-streams";
import { readV2UiSpecEventsByMessageId } from "../streams/spec-events";
import { buildV2ChatStreamPath } from "../streams/paths";
import {
  findSupersededAssistantIds,
  toProjectedV2Messages,
  toUnknownArray,
} from "./messages";

type ProjectV2StreamSnapshotOptions = {
  threadId: string;
  replaceLatestAssistant?: boolean;
};

export type ProjectV2StreamSnapshotResult = {
  persistedMessageCount: number;
  resumeOffset?: string;
};

export async function projectV2StreamSnapshotToDb({
  threadId,
  replaceLatestAssistant = false,
}: ProjectV2StreamSnapshotOptions): Promise<ProjectV2StreamSnapshotResult> {
  const streamPath = buildV2ChatStreamPath(threadId);
  const [snapshotResult, specPartsByMessageId] = await Promise.all([
    materializeSnapshotFromDurableStream({
      readUrl: buildReadStreamUrl(streamPath),
      headers: getDurableReadHeaders(),
    }),
    readV2UiSpecEventsByMessageId(threadId),
  ]);
  const { messages, offset } = snapshotResult;

  const projectedMessages = toProjectedV2Messages(
    threadId,
    toUnknownArray(messages),
    specPartsByMessageId,
  );
  const supersededAssistantIds = new Set(
    findSupersededAssistantIds(projectedMessages),
  );
  let resolvedResumeOffset = offset;
  if (resolvedResumeOffset === undefined) {
    try {
      resolvedResumeOffset = await readDurableStreamHeadOffset(streamPath);
    } catch {
      // The durable snapshot can still be projected without a head offset.
    }
  }

  const transactionResult = await db.transaction(async (tx) => {
    const [thread, existingRows] = await Promise.all([
      tx
        .select({
          resumeOffset: v2Threads.resumeOffset,
        })
        .from(v2Threads)
        .where(eq(v2Threads.id, threadId))
        .limit(1),
      tx
        .select({ id: v2Messages.id })
        .from(v2Messages)
        .where(eq(v2Messages.threadId, threadId)),
    ]);

    const threadRow = thread[0];
    if (!threadRow) {
      throw new Error(`Thread "${threadId}" not found during projection`);
    }

    const existingIds = new Set(existingRows.map((row) => row.id));
    if (replaceLatestAssistant && supersededAssistantIds.size > 0) {
      const supersededIds = [...supersededAssistantIds];
      await tx
        .delete(v2Messages)
        .where(
          and(
            eq(v2Messages.threadId, threadId),
            inArray(v2Messages.id, supersededIds),
          ),
        );
      supersededIds.forEach((id) => existingIds.delete(id));
    }

    const nowMs = Date.now();
    const newRows = projectedMessages
      .filter((message) => !supersededAssistantIds.has(message.id))
      .filter((message) => !existingIds.has(message.id))
      .map((message, index) => {
        return {
          id: message.id,
          threadId,
          role: message.role,
          content: message.content,
          parts: message.parts,
          createdAt: new Date(nowMs + index),
        };
      });

    if (newRows.length > 0) {
      // V2 runtime parts include custom ui-spec payloads that are narrowed at read time.
      await tx
        .insert(v2Messages)
        .values(newRows as never)
        .onConflictDoNothing();
    }

    const shouldUpdateResumeOffset =
      resolvedResumeOffset !== undefined &&
      resolvedResumeOffset !== threadRow.resumeOffset;
    const shouldTouchThread = newRows.length > 0 || shouldUpdateResumeOffset;

    if (shouldTouchThread) {
      await tx
        .update(v2Threads)
        .set({
          updatedAt: new Date(),
          ...(shouldUpdateResumeOffset
            ? { resumeOffset: resolvedResumeOffset }
            : {}),
        })
        .where(eq(v2Threads.id, threadId));
    }

    return {
      newRowCount: newRows.length,
    };
  });

  return {
    persistedMessageCount: transactionResult.newRowCount,
    resumeOffset: resolvedResumeOffset,
  };
}
