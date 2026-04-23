import { chat, generateMessageId } from "@tanstack/ai";
import { nanoid } from "nanoid";
import { db } from "~/db";
import { threads, messages as messagesTable } from "~/db/schema";
import { eq, desc, count, asc } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import type { StreamChunk, MessagePart } from "@tanstack/ai";
import type { AgentRunTelemetry } from "~/lib/agent-runner";
import type { AppMessagePart } from "~/components/chat/message-row.types";
import {
  buildArgsPreview,
  buildResultSummary,
} from "~/lib/server/message-part-previews";
import {
  createRunMetadata,
  summarizeToolActivity,
} from "~/lib/agent-runtime-utils";
import { getAzureAdapter } from "~/lib/openai-adapter";
import {
  createChildSpan,
  finalizeAgentRunTrace,
  finishPersistenceSpan,
  startPersistenceSpan,
} from "~/lib/telemetry/agent-spans";
import {
  endTraceSpan,
  markTraceError,
  markTraceSuccess,
} from "~/lib/telemetry/otel";
import {
  buildChatStreamPath,
  readDurableStreamHeadOffset,
} from "~/lib/durable-streams";

function getRunTerminalEventName(
  status: AgentRunTelemetry["status"],
): "run_complete" | "run_aborted" | "run_waiting_input" | "run_error" {
  if (status === "completed") return "run_complete";
  if (status === "aborted") return "run_aborted";
  if (status === "awaiting_input") return "run_waiting_input";
  return "run_error";
}

export function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function createThread(
  title: string,
  source?: string,
): Promise<string> {
  const now = new Date();
  const id = nanoid();
  await db
    .insert(threads)
    .values({
      id,
      title,
      source: source ?? null,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

/**
 * Idempotent by message id. Interactive client tools trigger continuation
 * POSTs (/api/chat) that replay the full message history — including the
 * original user text. We must only insert the user row once per id.
 *
 * If `incomingUserId` is provided and a row with that id already exists in
 * `messages`, we short-circuit. Otherwise we insert using the provided id
 * (or a generated one). This prevents the prior bug where continuations
 * wrote duplicate user rows on every tool-result turn.
 */
export async function persistUserMessage(
  threadId: string,
  userContent: string,
  userParts: Array<MessagePart>,
  metadata?: Record<string, unknown>,
  incomingUserId?: string,
) {
  if (incomingUserId) {
    const existing = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(eq(messagesTable.id, incomingUserId))
      .limit(1);
    if (existing.length > 0) {
      return existing[0].id;
    }
  }

  const id = incomingUserId ?? generateMessageId();
  const now = new Date();
  await db.insert(messagesTable).values({
    id,
    threadId,
    role: "user",
    content: userContent,
    parts: userParts,
    metadata,
    createdAt: now,
  });
  await db
    .update(threads)
    .set({ updatedAt: now })
    .where(eq(threads.id, threadId));
  return id;
}

/**
 * On continuation POSTs (triggered by a `.client()` tool resolving), the
 * client's message array carries the original assistant turn with its
 * tool-call part now containing `output` plus a fresh `tool-result` part.
 * The DB copy of that row still shows `state: "input-complete"` with no
 * output because the server stream ended before the user submitted.
 *
 * This syncs the incoming version back into the DB row so reloads and new
 * subscribers see the submitted state. Idempotent: only writes when parts
 * actually changed.
 */
/**
 * Enriches incoming parts with server-computed preview fields before writing
 * to the DB. Safe to call multiple times — already-enriched parts are skipped.
 */
function normalizeIncomingParts(
  parts: Array<MessagePart>,
): Array<AppMessagePart> {
  return parts.map((part) => {
    const p = part as AppMessagePart;
    if (p.type === "tool-result") {
      const tr =
        p as import("~/components/chat/message-row.types").ToolResultPart;
      if (tr.summary !== undefined) return p;
      return { ...tr, summary: buildResultSummary(tr.content) };
    }
    if (p.type === "tool-call") {
      const tc =
        p as import("~/components/chat/message-row.types").AppToolCallPart;
      if (tc.argsPreview !== undefined) return p;
      return { ...tc, argsPreview: buildArgsPreview(tc.arguments) };
    }
    return p;
  });
}

export async function syncPriorToolOutputs(
  threadId: string,
  incomingMessages: Array<{
    id?: string;
    role?: string;
    parts?: Array<MessagePart>;
  }>,
): Promise<void> {
  const candidateMessageIds = new Set<string>();
  const candidateToolCallIds = new Set<string>();
  for (const m of incomingMessages) {
    if (m.role !== "assistant" || !Array.isArray(m.parts)) continue;
    if (typeof m.id === "string") candidateMessageIds.add(m.id);
    for (const id of extractToolCallIdsFromParts(m.parts)) {
      candidateToolCallIds.add(id);
    }
  }
  if (candidateMessageIds.size === 0 && candidateToolCallIds.size === 0) return;

  const rows = await db
    .select({ id: messagesTable.id, parts: messagesTable.parts })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId));

  const byId = new Map<string, Array<AppMessagePart> | null>();
  const toolCallIdToRowId = new Map<string, string>();
  for (const row of rows) {
    byId.set(row.id, row.parts as Array<AppMessagePart> | null);
    if (!row.parts) continue;
    for (const toolCallId of extractToolCallIdsFromParts(row.parts)) {
      if (!toolCallIdToRowId.has(toolCallId)) {
        toolCallIdToRowId.set(toolCallId, row.id);
      }
    }
  }

  for (const m of incomingMessages) {
    if (m.role !== "assistant") continue;
    const rawParts = Array.isArray(m.parts) ? m.parts : [];
    const incomingParts = normalizeIncomingParts(rawParts);
    const incomingToolCallIds = extractToolCallIdsFromParts(rawParts);

    // Primary match: assistant message id (works when ids are aligned).
    // Fallback match: tool-call ids contained in the assistant row. This
    // handles cases where persisted assistant ids differ from client ids.
    const incomingId = typeof m.id === "string" ? m.id : undefined;
    let targetRowId =
      incomingId && byId.has(incomingId) ? incomingId : undefined;
    if (!targetRowId) {
      for (const id of incomingToolCallIds) {
        const mapped = toolCallIdToRowId.get(id);
        if (mapped) {
          targetRowId = mapped;
          break;
        }
      }
    }
    if (!targetRowId) continue;

    const dbParts = byId.get(targetRowId);
    if (!dbParts) continue;
    if (!shouldUpgradeParts(dbParts as Array<MessagePart>, rawParts)) continue;
    await db
      .update(messagesTable)
      .set({ parts: incomingParts })
      .where(eq(messagesTable.id, targetRowId));
    byId.set(targetRowId, incomingParts);
  }
}

function extractToolCallIdsFromParts(parts: Array<MessagePart>): Array<string> {
  const ids = new Set<string>();
  for (const part of parts) {
    if ((part as { type?: string }).type === "tool-call") {
      const toolCall = part as { id?: string };
      if (typeof toolCall.id === "string") ids.add(toolCall.id);
      continue;
    }
    if ((part as { type?: string }).type === "tool-result") {
      const toolResult = part as { toolCallId?: string };
      if (typeof toolResult.toolCallId === "string")
        ids.add(toolResult.toolCallId);
    }
  }
  return Array.from(ids);
}

/**
 * Returns true when `incoming` carries tool-call outputs or tool-result parts
 * that `dbParts` lacks. Prevents redundant writes on every continuation.
 */
function shouldUpgradeParts(
  dbParts: Array<MessagePart>,
  incoming: Array<MessagePart>,
): boolean {
  const dbToolResults = new Set<string>();
  const dbToolOutputs = new Set<string>();
  for (const p of dbParts) {
    if ((p as { type?: string }).type === "tool-result") {
      const tr = p as { toolCallId?: string };
      if (typeof tr.toolCallId === "string") dbToolResults.add(tr.toolCallId);
    } else if ((p as { type?: string }).type === "tool-call") {
      const tc = p as { id?: string; output?: unknown };
      if (typeof tc.id === "string" && tc.output !== undefined) {
        dbToolOutputs.add(tc.id);
      }
    }
  }

  for (const p of incoming) {
    if ((p as { type?: string }).type === "tool-result") {
      const tr = p as { toolCallId?: string };
      if (
        typeof tr.toolCallId === "string" &&
        !dbToolResults.has(tr.toolCallId)
      ) {
        return true;
      }
    } else if ((p as { type?: string }).type === "tool-call") {
      const tc = p as { id?: string; output?: unknown };
      if (
        typeof tc.id === "string" &&
        tc.output !== undefined &&
        !dbToolOutputs.has(tc.id)
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function persistAssistantMessage(
  threadId: string,
  content: string,
  parts: Array<AppMessagePart>,
  metadata?: Record<string, unknown>,
  resumeOffset?: string,
) {
  // Every completed stream gets its own assistant row. Continuations after a
  // client-tool resolution produce a fresh assistant turn, so appending is
  // always correct. The previous "last must be user" guard was removed because
  // it blocked continuation persistence once `persistUserMessage` became
  // idempotent.
  const id = generateMessageId();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(messagesTable).values({
      id,
      threadId,
      role: "assistant",
      content,
      parts,
      metadata,
      createdAt: now,
    });

    await tx
      .update(threads)
      .set({
        updatedAt: now,
        ...(resumeOffset ? { resumeOffset } : {}),
      })
      .where(eq(threads.id, threadId));
  });

  return id;
}

export async function maybeGenerateTitle(
  threadId: string,
  userContent: string,
): Promise<string | null> {
  if (isPlaceholderUserContent(userContent)) return null;

  const msgCount = await db
    .select({ n: count() })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId));

  if (msgCount[0].n > 2) return null;

  const [thread] = await db
    .select({ title: threads.title })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread) return null;

  const isGenericTitle =
    thread.title === "New Chat" ||
    thread.title === "Untitled" ||
    thread.title === userContent ||
    thread.title.endsWith("...");

  if (!isGenericTitle) return null;

  try {
    const adapter = getAzureAdapter();
    const titleStream = chat({
      adapter,
      messages: [
        {
          role: "user",
          content: `Generate a short title (max 6 words, no quotes) for a conversation that starts with: "${userContent}"`,
        },
      ],
    });

    let title = "";
    for await (const chunk of titleStream) {
      if (chunk.type === "TEXT_MESSAGE_CONTENT") {
        if (chunk.delta) title += chunk.delta;
      }
    }

    title = title.replace(/^["']|["']$/g, "").trim();
    if (title) {
      await db.update(threads).set({ title }).where(eq(threads.id, threadId));
      return title;
    }
  } catch {
    // Best-effort
  }
  return null;
}

export async function generateToolSummary(toolName: string): Promise<string> {
  return summarizeToolActivity(toolName);
}

export async function loadThreadMessagesForRuntime(threadId: string) {
  const persisted = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(asc(messagesTable.createdAt));

  return persisted.map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
    parts: message.parts ?? [
      { type: "text" as const, content: message.content },
    ],
  }));
}

export async function* withPersistence(
  stream: AsyncIterable<StreamChunk>,
  threadId: string,
  threadCreated: boolean,
  userContent: string,
  userParts: Array<MessagePart>,
  persistUserTurn: boolean,
  log: RequestLogger,
  telemetry: AgentRunTelemetry,
  userMessageId?: string,
): AsyncIterable<StreamChunk> {
  startPersistenceSpan(telemetry.traceState, {
    "agent.thread_id": threadId,
    "agent.thread_created": threadCreated,
  });

  const runPersistenceStep = async <T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T> => {
    const span = createChildSpan(telemetry.traceState, name, { attributes });
    try {
      const result = await fn();
      markTraceSuccess(span, attributes);
      return result;
    } catch (error) {
      markTraceError(span, error, attributes);
      throw error;
    } finally {
      endTraceSpan(span);
    }
  };

  try {
    if (threadCreated) {
      yield {
        type: "CUSTOM" as const,
        name: "thread_created",
        value: { threadId },
        timestamp: Date.now(),
      };
    }

    if (persistUserTurn) {
      try {
        await runPersistenceStep(
          "agent.persistence.user_message",
          () =>
            persistUserMessage(
              threadId,
              userContent,
              userParts,
              createRunMetadata(telemetry),
              userMessageId,
            ),
          {
            "agent.thread_id": threadId,
            "agent.message_role": "user",
          },
        );
      } catch (err) {
        log.set({ persistUserError: String(err) });
      }
    }

    // Start title generation early so the sidebar can receive a title update
    // while the assistant turn is still streaming.
    const titlePromise = persistUserTurn
      ? maybeGenerateTitle(threadId, userContent).catch(() => null)
      : null;
    let generatedTitle: string | null = null;
    let titleEventEmitted = false;
    if (titlePromise) {
      void titlePromise.then((title) => {
        generatedTitle = title;
      });
    }

    let accumulated = "";
    let accumulatedThinking = "";
    const assistantParts: Array<AppMessagePart> = [];
    const toolCalls = new Map<string, { name: string; args: string }>();
    let summaryEmitted = false;
    let streamError: string | null = null;
    let persistenceError: string | null = null;

    try {
      for await (const chunk of stream) {
        if (chunk.type === "STEP_FINISHED") {
          const delta = (chunk as { delta?: string }).delta || "";
          if (delta) accumulatedThinking += delta;
          yield {
            ...chunk,
            delta,
            content: accumulatedThinking,
          } as StreamChunk;
          if (!titleEventEmitted && generatedTitle) {
            titleEventEmitted = true;
            yield {
              type: "CUSTOM" as const,
              name: "thread_title_updated",
              value: { threadId, title: generatedTitle },
              timestamp: Date.now(),
            };
          }
          continue;
        }

        if (chunk.type === "TEXT_MESSAGE_CONTENT") {
          if (chunk.content) {
            accumulated = chunk.content;
          } else if (chunk.delta) {
            accumulated += chunk.delta;
          }
        } else if (chunk.type === "TOOL_CALL_START") {
          toolCalls.set(chunk.toolCallId, { name: chunk.toolName, args: "" });
          if (!summaryEmitted) {
            summaryEmitted = true;
            const summary = await generateToolSummary(chunk.toolName);
            assistantParts.push({
              type: "tool-summary",
              content: summary,
            });
            yield {
              type: "CUSTOM" as const,
              name: "tool_summary",
              value: { summary },
              timestamp: Date.now(),
            };
          }
        } else if (chunk.type === "TOOL_CALL_ARGS") {
          const tc = toolCalls.get(chunk.toolCallId);
          if (tc) tc.args += chunk.delta;
        } else if (chunk.type === "TOOL_CALL_END") {
          const tc = toolCalls.get(chunk.toolCallId);
          if (tc) {
            assistantParts.push({
              type: "tool-call",
              id: chunk.toolCallId,
              name: tc.name,
              arguments: tc.args,
              argsPreview: buildArgsPreview(tc.args),
              state: chunk.result ? "result" : "input-complete",
              output: chunk.result ? tryParseJSON(chunk.result) : undefined,
            });
          }
        } else if (chunk.type === "CUSTOM" && chunk.name === "spec_complete") {
          const { spec, specIndex } = chunk.value as {
            spec: unknown;
            specIndex: number;
          };
          assistantParts.push({
            type: "ui-spec",
            spec: spec as import("@json-render/core").Spec,
            specIndex,
          });
        }
        yield {
          ...chunk,
        };
        if (!titleEventEmitted && generatedTitle) {
          titleEventEmitted = true;
          yield {
            type: "CUSTOM" as const,
            name: "thread_title_updated",
            value: { threadId, title: generatedTitle },
            timestamp: Date.now(),
          };
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
      if (telemetry.status === "running") {
        telemetry.status = "failed";
        telemetry.error = streamError;
        telemetry.completedAt = Date.now();
        telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
      }
      log.set({
        streamError,
        runStatus: telemetry.status,
      });
    }

    if (accumulatedThinking) {
      assistantParts.unshift({
        type: "thinking",
        content: accumulatedThinking,
      });
    }

    if (accumulated) {
      assistantParts.push({ type: "text", content: accumulated });
    }

    if (assistantParts.length > 0) {
      let resumeOffset: string | undefined;
      try {
        resumeOffset = await runPersistenceStep(
          "agent.persistence.resume_offset",
          () => readDurableStreamHeadOffset(buildChatStreamPath(threadId)),
          {
            "agent.thread_id": threadId,
          },
        );
      } catch (err) {
        log.set({ resumeOffsetError: String(err) });
      }

      try {
        await runPersistenceStep(
          "agent.persistence.assistant_message",
          () =>
            persistAssistantMessage(
              threadId,
              accumulated,
              assistantParts,
              createRunMetadata(telemetry, {
                error: streamError ?? undefined,
                partial: !!streamError,
              }),
              resumeOffset,
            ),
          {
            "agent.thread_id": threadId,
            "agent.message_role": "assistant",
            "agent.partial": !!streamError,
          },
        );
      } catch (err) {
        persistenceError = err instanceof Error ? err.message : String(err);
        log.set({ persistAssistantError: persistenceError });
      }
    }

    // Try to deliver a title update before terminal events without stalling the
    // response tail; if generation is still running, continue after a short wait.
    if (!titleEventEmitted && titlePromise) {
      const settledTitle =
        generatedTitle ??
        (await Promise.race<string | null>([
          titlePromise,
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 200);
          }),
        ]));
      if (settledTitle) {
        titleEventEmitted = true;
        yield {
          type: "CUSTOM" as const,
          name: "thread_title_updated",
          value: { threadId, title: settledTitle },
          timestamp: Date.now(),
        };
      }
    }

    yield {
      type: "CUSTOM" as const,
      name: getRunTerminalEventName(telemetry.status),
      value: {
        threadId,
        status: telemetry.status,
        finishReason: telemetry.finishReason ?? null,
        durationMs: telemetry.durationMs ?? null,
        toolCallCount: telemetry.toolCallCount,
        iterationCount: telemetry.iterationCount,
        error: streamError ?? telemetry.error ?? null,
        traceId: telemetry.traceId ?? null,
      },
      timestamp: Date.now(),
    };

    yield {
      type: "CUSTOM" as const,
      name: "persistence_complete",
      value: {
        threadId,
        status: telemetry.status,
        error: streamError ?? persistenceError ?? telemetry.error ?? null,
        traceId: telemetry.traceId ?? null,
      },
      timestamp: Date.now(),
    };

    const finalError =
      persistenceError ??
      streamError ??
      (telemetry.status === "failed" || telemetry.status === "aborted"
        ? telemetry.error
        : undefined);

    finishPersistenceSpan(telemetry.traceState, {
      error: finalError,
      attributes: {
        "agent.status": telemetry.status,
        "agent.thread_id": threadId,
      },
    });
    finalizeAgentRunTrace(telemetry.traceState, {
      error: finalError,
      attributes: {
        "agent.status": telemetry.status,
        "agent.thread_id": threadId,
        "agent.tool_call_count": telemetry.toolCallCount,
        "agent.iteration_count": telemetry.iterationCount,
      },
    });
  } finally {
    if (!telemetry.traceState?.completed) {
      finishPersistenceSpan(telemetry.traceState, {
        error: telemetry.error,
        attributes: {
          "agent.status": telemetry.status,
          "agent.thread_id": threadId,
        },
      });
      finalizeAgentRunTrace(telemetry.traceState, {
        error: telemetry.error,
        attributes: {
          "agent.status": telemetry.status,
          "agent.thread_id": threadId,
        },
      });
    }
  }
}

/**
 * Marker prefix on `content` when the user turn carries only non-text parts
 * (e.g. an image-only prompt). Persistence still needs a non-null content
 * string for `messages.content`, but title generation and other text-only
 * heuristics should not key off the placeholder. Use `isPlaceholderUserContent`
 * to detect.
 */
export const ATTACHMENT_ONLY_CONTENT_PREFIX = "[attachments]";

export function isPlaceholderUserContent(content: string): boolean {
  return content.startsWith(ATTACHMENT_ONLY_CONTENT_PREFIX);
}

function summarizePartForPlaceholder(part: any): string | null {
  const type = (part as { type?: string })?.type;
  if (!type) return null;
  if (type === "image") return "image";
  if (type === "audio") return "audio";
  if (type === "video") return "video";
  if (type === "document") return "document";
  return null;
}

export function extractUserMessage(messages: Array<any>): {
  id: string | undefined;
  content: string;
  parts: Array<MessagePart>;
} {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: any) => m.role === "user");

  if (!lastUserMessage) return { id: undefined, content: "", parts: [] };

  const id =
    typeof lastUserMessage.id === "string" ? lastUserMessage.id : undefined;

  if (typeof lastUserMessage.content === "string") {
    return {
      id,
      content: lastUserMessage.content,
      parts: [{ type: "text", content: lastUserMessage.content }],
    };
  }

  if (Array.isArray(lastUserMessage.parts)) {
    const textContent = lastUserMessage.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.content)
      .join("");

    if (textContent.length > 0) {
      return {
        id,
        content: textContent,
        parts: lastUserMessage.parts,
      };
    }

    const summaries: string[] = [];
    for (const part of lastUserMessage.parts) {
      const label = summarizePartForPlaceholder(part);
      if (label) summaries.push(label);
    }

    if (summaries.length > 0) {
      return {
        id,
        content: `${ATTACHMENT_ONLY_CONTENT_PREFIX} ${summaries.join(", ")}`,
        parts: lastUserMessage.parts,
      };
    }

    return { id, content: "", parts: lastUserMessage.parts };
  }

  return { id, content: "", parts: [] };
}
