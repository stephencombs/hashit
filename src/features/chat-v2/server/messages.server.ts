import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { v2Messages } from "~/db/schema";
import {
  isDurableStreamsConfigured,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";
import { v2MessageSchema, type V2ThreadSession } from "../types";
import { buildV2ChatStreamPath } from "./keys";
import {
  normalizeV2MessagesForRuntime,
  type V2RuntimePart,
  type V2RuntimeMessage,
} from "./runtime-message";
import { getV2ThreadByIdServer } from "./threads.server";

const v2MessageArraySchema = z.array(v2MessageSchema);
type RuntimeUiSpecPart = Extract<V2RuntimePart, { type: "ui-spec" }>;

export type V2ThreadMessageUiSpecs = {
  messageId: string;
  specs: Array<RuntimeUiSpecPart>;
};

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

export async function getV2ThreadSessionServer(
  threadId: string,
): Promise<V2ThreadSession> {
  const thread = await getV2ThreadByIdServer(threadId);

  let initialResumeOffset: string | undefined =
    thread.resumeOffset ?? undefined;
  if (!initialResumeOffset && isDurableStreamsConfigured()) {
    if (thread.isStreaming) {
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
