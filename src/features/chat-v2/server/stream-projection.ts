import { materializeSnapshotFromDurableStream } from "@durable-streams/tanstack-ai-transport";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import { v2Messages, v2Threads } from "~/db/schema";
import {
  buildReadStreamUrl,
  getDurableReadHeaders,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";
import { readV2UiSpecEventsByMessageId } from "./durable-spec-events";
import { buildV2ChatStreamPath } from "./keys";
import { normalizeRuntimeParts, type V2RuntimePart } from "./runtime-message";
import {
  ATTACHMENT_ONLY_CONTENT_PREFIX,
  extractTextContent,
  summarizePartForPlaceholder,
} from "./user-message";

/**
 * Materializes Durable Stream chat state and projects it into V2 Postgres
 * tables (`v2_messages`, `v2_threads`) with idempotent inserts.
 */
type ProjectV2StreamSnapshotOptions = {
  threadId: string;
  replaceLatestAssistant?: boolean;
};

type SnapshotMessage = {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

type ProjectedRole = "user" | "assistant";

type ProjectedMessage = {
  id: string;
  role: ProjectedRole;
  content: string;
  parts: Array<V2RuntimePart>;
};

export type ProjectV2StreamSnapshotResult = {
  persistedMessageCount: number;
  resumeOffset?: string;
};

function asMessageRole(value: unknown): ProjectedRole | null {
  if (value === "user" || value === "assistant") return value;
  return null;
}

function toMessageId(value: unknown, threadId: string, index: number): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return `${threadId}__snapshot__${index}`;
}

function toUnknownArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

function deriveSnapshotContent(
  fallbackContent: unknown,
  parts: Array<unknown>,
): string {
  if (
    typeof fallbackContent === "string" &&
    fallbackContent.trim().length > 0
  ) {
    return fallbackContent;
  }

  const textContent = extractTextContent(parts);
  if (textContent.length > 0) {
    return textContent;
  }

  const summaries = parts
    .map((part) => summarizePartForPlaceholder(part))
    .filter((value): value is string => value !== null);
  if (summaries.length > 0) {
    return `${ATTACHMENT_ONLY_CONTENT_PREFIX} ${summaries.join(", ")}`;
  }

  return "";
}

function normalizeParts(
  parts: Array<unknown>,
  fallbackContent: string,
): Array<V2RuntimePart> {
  return normalizeRuntimeParts(parts, fallbackContent);
}

function toProjectedMessages(
  threadId: string,
  snapshotMessages: Array<unknown>,
  specPartsByMessageId: Map<string, Array<unknown>>,
): Array<ProjectedMessage> {
  const projected: Array<ProjectedMessage> = [];

  snapshotMessages.forEach((rawMessage, index) => {
    const message = (rawMessage ?? {}) as SnapshotMessage;
    const role = asMessageRole(message.role);
    if (!role) return;

    const parts = Array.isArray(message.parts) ? [...message.parts] : [];
    const eventSpecParts = specPartsByMessageId.get(
      toMessageId(message.id, threadId, index),
    );
    if (eventSpecParts && eventSpecParts.length > 0) {
      parts.push(...eventSpecParts);
    }
    const content = deriveSnapshotContent(message.content, parts);
    projected.push({
      id: toMessageId(message.id, threadId, index),
      role,
      content,
      parts: normalizeParts(parts, content),
    });
  });

  return projected;
}

function findSupersededAssistantIds(
  messages: Array<ProjectedMessage>,
): Array<string> {
  const superseded: Array<string> = [];
  let assistantIdsSinceLastUser: Array<string> = [];
  let hasSeenUser = false;

  const flushTurnAssistants = (): void => {
    if (assistantIdsSinceLastUser.length > 1) {
      superseded.push(...assistantIdsSinceLastUser.slice(0, -1));
    }
    assistantIdsSinceLastUser = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushTurnAssistants();
      hasSeenUser = true;
      continue;
    }

    if (message.role === "assistant" && hasSeenUser) {
      assistantIdsSinceLastUser.push(message.id);
    }
  }

  flushTurnAssistants();
  return superseded;
}

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

  const projectedMessages = toProjectedMessages(
    threadId,
    toUnknownArray(messages),
    specPartsByMessageId,
  );
  const [thread, existingRows] = await Promise.all([
    db
      .select({
        resumeOffset: v2Threads.resumeOffset,
      })
      .from(v2Threads)
      .where(eq(v2Threads.id, threadId))
      .limit(1),
    db
      .select({ id: v2Messages.id })
      .from(v2Messages)
      .where(eq(v2Messages.threadId, threadId)),
  ]);

  const threadRow = thread[0];
  if (!threadRow) {
    throw new Error(`Thread "${threadId}" not found during projection`);
  }

  const existingIds = new Set(existingRows.map((row) => row.id));
  const supersededAssistantIds = new Set(
    findSupersededAssistantIds(projectedMessages),
  );
  if (replaceLatestAssistant && supersededAssistantIds.size > 0) {
    const supersededIds = [...supersededAssistantIds];
    await db
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
    await db
      .insert(v2Messages)
      .values(newRows as never)
      .onConflictDoNothing();
  }

  let resumeOffset = offset;
  const shouldReadHeadOffset =
    resumeOffset === undefined &&
    (newRows.length > 0 || threadRow.resumeOffset == null);
  if (shouldReadHeadOffset) {
    try {
      resumeOffset = await readDurableStreamHeadOffset(streamPath);
    } catch {
      // The durable snapshot can still be projected without a head offset.
    }
  }
  const shouldUpdateResumeOffset =
    resumeOffset !== undefined && resumeOffset !== threadRow.resumeOffset;
  const shouldTouchThread = newRows.length > 0 || shouldUpdateResumeOffset;

  if (shouldTouchThread) {
    await db
      .update(v2Threads)
      .set({
        updatedAt: new Date(),
        ...(shouldUpdateResumeOffset ? { resumeOffset } : {}),
      })
      .where(eq(v2Threads.id, threadId));
  }

  return {
    persistedMessageCount: newRows.length,
    resumeOffset,
  };
}
