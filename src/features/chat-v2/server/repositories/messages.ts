import { and, asc, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { v2Messages } from "~/db/schema";
import {
  type V2Message,
  v2MessageSchema,
  type V2RuntimePart,
  type V2ThreadMessageUiSpecs,
  type V2ThreadMessagesPage,
} from "../../types";
import { v2ThreadMessagesPageInputSchema } from "../domain";
import {
  normalizeV2MessagesForRuntime,
  normalizeV2MessageForRuntime,
} from "../runtime/message-normalization";

const v2MessageArraySchema = z.array(v2MessageSchema);
type RuntimeUiSpecPart = Extract<V2RuntimePart, { type: "ui-spec" }>;

function isRuntimeUiSpecPart(part: unknown): part is RuntimeUiSpecPart {
  if (!part || typeof part !== "object") return false;

  const candidate = part as {
    type?: unknown;
    spec?: unknown;
    specIndex?: unknown;
  };

  return (
    candidate.type === "ui-spec" &&
    candidate.spec != null &&
    typeof candidate.spec === "object" &&
    typeof candidate.specIndex === "number" &&
    Number.isInteger(candidate.specIndex) &&
    candidate.specIndex >= 0
  );
}

async function getV2MessageCursorCreatedAt(params: {
  threadId: string;
  before?: string;
}): Promise<Date | undefined> {
  if (!params.before) return undefined;

  const [cursor] = await db
    .select({ createdAt: v2Messages.createdAt })
    .from(v2Messages)
    .where(
      and(
        eq(v2Messages.threadId, params.threadId),
        eq(v2Messages.id, params.before),
      ),
    )
    .limit(1);

  return cursor?.createdAt;
}

export async function listV2ThreadMessagesRepository(
  threadId: string,
): Promise<Array<V2Message>> {
  const rows = await db
    .select()
    .from(v2Messages)
    .where(eq(v2Messages.threadId, threadId))
    .orderBy(asc(v2Messages.createdAt));

  return v2MessageArraySchema.parse(rows);
}

export async function listV2ThreadMessagesServer(
  threadId: string,
): Promise<ReturnType<typeof normalizeV2MessagesForRuntime>> {
  return normalizeV2MessagesForRuntime(
    await listV2ThreadMessagesRepository(threadId),
  );
}

export async function listV2ThreadMessagesPageServer(
  input: unknown,
): Promise<V2ThreadMessagesPage> {
  const params = v2ThreadMessagesPageInputSchema.parse(input);
  const cursorCreatedAt = await getV2MessageCursorCreatedAt(params);
  const where =
    cursorCreatedAt == null
      ? eq(v2Messages.threadId, params.threadId)
      : and(
          eq(v2Messages.threadId, params.threadId),
          lt(v2Messages.createdAt, cursorCreatedAt),
        );

  const rows = await db
    .select()
    .from(v2Messages)
    .where(where)
    .orderBy(desc(v2Messages.createdAt))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const pageRows = v2MessageArraySchema
    .parse(rows.slice(0, params.limit))
    .reverse();
  const messages = pageRows.map((message) =>
    normalizeV2MessageForRuntime(message),
  );

  return {
    messages,
    hasMore,
    ...(hasMore && messages[0] ? { nextCursor: messages[0].id } : {}),
  };
}

export async function listV2ThreadMessageUiSpecsServer(
  threadId: string,
): Promise<Array<V2ThreadMessageUiSpecs>> {
  const rows = await db
    .select({
      id: v2Messages.id,
      parts: v2Messages.parts,
    })
    .from(v2Messages)
    .where(eq(v2Messages.threadId, threadId))
    .orderBy(asc(v2Messages.createdAt));

  const result: Array<V2ThreadMessageUiSpecs> = [];
  for (const row of rows) {
    const rawParts = Array.isArray(row.parts) ? row.parts : [];
    const specs = rawParts
      .filter(isRuntimeUiSpecPart)
      .sort((left, right) => left.specIndex - right.specIndex);
    if (specs.length === 0) continue;
    result.push({
      messageId: row.id,
      specs,
    });
  }

  return result;
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
