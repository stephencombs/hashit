import { materializeSnapshotFromDurableStream } from "@durable-streams/tanstack-ai-transport";
import { eq } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { db } from "~/db";
import { v2Messages, v2Threads } from "~/db/schema";
import {
  buildReadStreamUrl,
  getDurableReadHeaders,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";
import type { V2AgentRunTelemetry } from "./agent-runner";
import { buildV2ChatStreamPath } from "./keys";
import { createV2RunMetadata } from "./persistence-runtime";
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
  telemetry: V2AgentRunTelemetry;
  persistUserTurn: boolean;
  userMessageId?: string;
  log?: RequestLogger;
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
): Array<ProjectedMessage> {
  const projected: Array<ProjectedMessage> = [];

  snapshotMessages.forEach((rawMessage, index) => {
    const message = (rawMessage ?? {}) as SnapshotMessage;
    const role = asMessageRole(message.role);
    if (!role) return;

    const parts = Array.isArray(message.parts) ? message.parts : [];
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

function findLastMessageIdByRole(
  messages: Array<ProjectedMessage>,
  role: ProjectedRole,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === role) return message.id;
  }
  return undefined;
}

function createAssistantMetadata(
  telemetry: V2AgentRunTelemetry,
): Record<string, unknown> {
  const hasRunError: boolean =
    telemetry.status === "failed" || telemetry.status === "aborted";
  return createV2RunMetadata(telemetry, {
    error: hasRunError ? telemetry.error : undefined,
    partial: telemetry.status !== "completed",
  });
}

export async function projectV2StreamSnapshotToDb({
  threadId,
  telemetry,
  persistUserTurn,
  userMessageId,
  log,
}: ProjectV2StreamSnapshotOptions): Promise<ProjectV2StreamSnapshotResult> {
  const streamPath = buildV2ChatStreamPath(threadId);
  const { messages, offset } = await materializeSnapshotFromDurableStream({
    readUrl: buildReadStreamUrl(streamPath),
    headers: getDurableReadHeaders(),
  });

  const projectedMessages = toProjectedMessages(
    threadId,
    toUnknownArray(messages),
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
  const latestUserId = persistUserTurn
    ? (userMessageId ?? findLastMessageIdByRole(projectedMessages, "user"))
    : undefined;
  const latestAssistantId = findLastMessageIdByRole(
    projectedMessages,
    "assistant",
  );
  const userMetadata = createV2RunMetadata(telemetry);
  const assistantMetadata = createAssistantMetadata(telemetry);

  const nowMs = Date.now();
  const newRows = projectedMessages
    .filter((message) => !existingIds.has(message.id))
    .map((message, index) => {
      const metadata =
        message.role === "user" && latestUserId && message.id === latestUserId
          ? userMetadata
          : message.role === "assistant" &&
              latestAssistantId &&
              message.id === latestAssistantId
            ? assistantMetadata
            : undefined;

      return {
        id: message.id,
        threadId,
        role: message.role,
        content: message.content,
        parts: message.parts,
        metadata,
        createdAt: new Date(nowMs + index),
      };
    });

  if (newRows.length > 0) {
    await db.insert(v2Messages).values(newRows).onConflictDoNothing();
  }

  let resumeOffset = offset;
  const shouldReadHeadOffset =
    resumeOffset === undefined &&
    (newRows.length > 0 || threadRow.resumeOffset == null);
  if (shouldReadHeadOffset) {
    try {
      resumeOffset = await readDurableStreamHeadOffset(streamPath);
    } catch (error) {
      log?.set({
        v2ProjectionResumeOffsetError:
          error instanceof Error ? error.message : String(error),
      });
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

  log?.set({
    v2ProjectionMessageCount: projectedMessages.length,
    v2ProjectionInsertedCount: newRows.length,
    v2ProjectionResumeOffset: resumeOffset,
  });

  return {
    persistedMessageCount: newRows.length,
    resumeOffset,
  };
}
