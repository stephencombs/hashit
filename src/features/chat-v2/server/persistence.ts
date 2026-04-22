import {
  generateMessageId,
  type ChatMiddleware,
  type MessagePart,
  type StreamChunk,
} from "@tanstack/ai";
import { eq } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import type { AppMessagePart } from "~/components/chat/message-row.types";
import { db } from "~/db";
import { v2Messages, v2Threads } from "~/db/schema";
import { readDurableStreamHeadOffset } from "~/lib/durable-streams";
import {
  finalizeAgentRunTrace,
  finishPersistenceSpan,
  startPersistenceSpan,
} from "~/lib/telemetry/agent-spans";
import type {
  V2AgentRunStatus,
  V2AgentRunTelemetry,
} from "./agent-runner";
import { buildV2ChatStreamPath } from "./keys";
import { ATTACHMENT_ONLY_CONTENT_PREFIX } from "./user-message";

type CreateV2PersistenceMiddlewareOptions = {
  threadId: string;
  userContent: string;
  userParts: Array<MessagePart>;
  persistUserTurn: boolean;
  telemetry: V2AgentRunTelemetry;
  log?: RequestLogger;
  userMessageId?: string;
};

function getRunTerminalEventName(
  status: V2AgentRunStatus,
): "run_complete" | "run_aborted" | "run_waiting_input" | "run_error" {
  if (status === "completed") return "run_complete";
  if (status === "aborted") return "run_aborted";
  if (status === "awaiting_input") return "run_waiting_input";
  return "run_error";
}

function createCustomChunk(name: string, value: unknown): StreamChunk {
  return {
    type: "CUSTOM" as const,
    name,
    value,
    timestamp: Date.now(),
  };
}

function getChunkType(chunk: StreamChunk): string | undefined {
  const value = chunk as { type?: unknown };
  return typeof value.type === "string" ? value.type : undefined;
}

function getRunErrorMessage(chunk: StreamChunk): string | undefined {
  const candidate = chunk as {
    error?: {
      message?: unknown;
    } | unknown;
  };
  const error = candidate.error;
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function deriveThreadTitleFromUserTurn(userContent: string): string | null {
  const normalized = collapseWhitespace(userContent);
  if (!normalized || normalized.startsWith(ATTACHMENT_ONLY_CONTENT_PREFIX)) {
    return null;
  }

  const words = normalized.split(" ").slice(0, 6);
  let title = words.join(" ");
  if (title.length > 64) {
    title = title.slice(0, 64).trimEnd();
  }
  return title || null;
}

function createV2RunMetadata(
  telemetry: V2AgentRunTelemetry,
  overrides?: Partial<{
    status: V2AgentRunStatus;
    error: string;
    partial: boolean;
  }>,
): Record<string, unknown> {
  const status = overrides?.status ?? telemetry.status;
  return {
    runProfile: telemetry.profile,
    runSource: telemetry.source,
    runStatus: status,
    requestId: telemetry.requestId,
    streamId: telemetry.streamId,
    conversationId: telemetry.conversationId,
    provider: telemetry.provider,
    model: telemetry.model,
    traceId: telemetry.traceId,
    spanId: telemetry.spanId,
    iterationCount: telemetry.iterationCount,
    toolCallCount: telemetry.toolCallCount,
    toolCalls: telemetry.toolCalls,
    finishReason: telemetry.finishReason,
    usage: telemetry.usage,
    durationMs: telemetry.durationMs,
    error: overrides?.error ?? telemetry.error,
    partial: overrides?.partial ?? false,
    startedAt: new Date(telemetry.startedAt).toISOString(),
    completedAt:
      telemetry.completedAt != null
        ? new Date(telemetry.completedAt).toISOString()
        : null,
  };
}

async function maybeGenerateV2Title(
  threadId: string,
  userContent: string,
): Promise<string | null> {
  const title = deriveThreadTitleFromUserTurn(userContent);
  if (!title) return null;

  const [thread] = await db
    .select({ title: v2Threads.title })
    .from(v2Threads)
    .where(eq(v2Threads.id, threadId))
    .limit(1);

  if (!thread) return null;
  if (thread.title && thread.title !== "Untitled") return null;
  if (thread.title === title) return null;

  await db
    .update(v2Threads)
    .set({
      title,
      updatedAt: new Date(),
    })
    .where(eq(v2Threads.id, threadId));

  return title;
}

async function persistV2UserMessage(
  threadId: string,
  userContent: string,
  userParts: Array<MessagePart>,
  metadata?: Record<string, unknown>,
  incomingUserId?: string,
): Promise<string> {
  if (incomingUserId) {
    const existing = await db
      .select({ id: v2Messages.id })
      .from(v2Messages)
      .where(eq(v2Messages.id, incomingUserId))
      .limit(1);
    if (existing.length > 0) return existing[0].id;
  }

  const now = new Date();
  const id = incomingUserId ?? generateMessageId();
  await db.insert(v2Messages).values({
    id,
    threadId,
    role: "user",
    content: userContent,
    parts: userParts as Array<AppMessagePart>,
    metadata,
    createdAt: now,
  });
  await db
    .update(v2Threads)
    .set({ updatedAt: now })
    .where(eq(v2Threads.id, threadId));
  return id;
}

async function persistV2AssistantMessage(
  threadId: string,
  assistantContent: string,
  assistantParts: Array<AppMessagePart>,
  metadata?: Record<string, unknown>,
  resumeOffset?: string,
): Promise<string> {
  const now = new Date();
  const id = generateMessageId();
  await db.insert(v2Messages).values({
    id,
    threadId,
    role: "assistant",
    content: assistantContent,
    parts: assistantParts,
    metadata,
    createdAt: now,
  });
  await db
    .update(v2Threads)
    .set({
      updatedAt: now,
      resumeOffset: resumeOffset ?? null,
    })
    .where(eq(v2Threads.id, threadId));
  return id;
}

export function createV2PersistenceMiddleware({
  threadId,
  userContent,
  userParts,
  persistUserTurn,
  telemetry,
  log,
  userMessageId,
}: CreateV2PersistenceMiddlewareOptions): ChatMiddleware {
  let accumulatedText = "";
  let accumulatedThinking = "";
  const assistantParts: Array<AppMessagePart> = [];
  const toolCalls = new Map<string, { name: string; args: string }>();
  let streamError: string | null = null;
  let persistenceError: string | null = null;
  let titlePromise: Promise<string | null> | null = null;
  let generatedTitle: string | null = null;
  let titleEventEmitted = false;
  let assistantTextPartsAppended = false;
  let persistenceFinalized = false;
  let terminalEventsEmitted = false;

  const maybeEmitTitleEvent = (): StreamChunk | null => {
    if (!generatedTitle || titleEventEmitted) return null;
    titleEventEmitted = true;
    return createCustomChunk("thread_title_updated", {
      threadId,
      title: generatedTitle,
    });
  };

  const waitForTitleEvent = async (): Promise<StreamChunk | null> => {
    if (titleEventEmitted || !titlePromise) return null;
    const settledTitle =
      generatedTitle ??
      (await Promise.race<string | null>([
        titlePromise,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 200);
        }),
      ]));
    if (!settledTitle) return null;
    generatedTitle = settledTitle;
    titleEventEmitted = true;
    return createCustomChunk("thread_title_updated", {
      threadId,
      title: settledTitle,
    });
  };

  const appendAssistantTextParts = (): void => {
    if (assistantTextPartsAppended) return;
    assistantTextPartsAppended = true;

    if (accumulatedThinking) {
      assistantParts.unshift({
        type: "thinking",
        content: accumulatedThinking,
      });
    }

    if (accumulatedText) {
      assistantParts.push({
        type: "text",
        content: accumulatedText,
      });
    }
  };

  const finalizePersistence = async (): Promise<void> => {
    if (persistenceFinalized) return;
    persistenceFinalized = true;

    appendAssistantTextParts();

    if (assistantParts.length > 0) {
      let resumeOffset: string | undefined;
      try {
        resumeOffset = await readDurableStreamHeadOffset(
          buildV2ChatStreamPath(threadId),
        );
      } catch (error) {
        log?.set({
          resumeOffsetError: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await persistV2AssistantMessage(
          threadId,
          accumulatedText,
          assistantParts,
          createV2RunMetadata(telemetry, {
            error: streamError ?? undefined,
            partial: telemetry.status !== "completed",
          }),
          resumeOffset,
        );
      } catch (error) {
        persistenceError = error instanceof Error ? error.message : String(error);
        log?.set({
          persistAssistantError: persistenceError,
        });
      }
    }

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
  };

  const buildTerminalEvents = (): Array<StreamChunk> => [
    createCustomChunk(getRunTerminalEventName(telemetry.status), {
      threadId,
      status: telemetry.status,
      finishReason: telemetry.finishReason ?? null,
      durationMs: telemetry.durationMs ?? null,
      toolCallCount: telemetry.toolCallCount,
      iterationCount: telemetry.iterationCount,
      error: streamError ?? telemetry.error ?? null,
      traceId: telemetry.traceId ?? null,
    }),
    createCustomChunk("persistence_complete", {
      threadId,
      status: telemetry.status,
      error: streamError ?? persistenceError ?? telemetry.error ?? null,
      traceId: telemetry.traceId ?? null,
    }),
  ];

  return {
    name: "v2-persistence",
    async onStart() {
      startPersistenceSpan(telemetry.traceState, {
        "agent.thread_id": threadId,
      });

      if (persistUserTurn) {
        try {
          await persistV2UserMessage(
            threadId,
            userContent,
            userParts,
            createV2RunMetadata(telemetry),
            userMessageId,
          );
        } catch (error) {
          log?.set({
            persistUserError: error instanceof Error ? error.message : String(error),
          });
        }
      }

      titlePromise = persistUserTurn
        ? maybeGenerateV2Title(threadId, userContent).catch(() => null)
        : null;
      if (titlePromise) {
        void titlePromise.then((title) => {
          generatedTitle = title;
        });
      }
    },
    async onChunk(_ctx, chunk) {
      const type = getChunkType(chunk);
      const output: Array<StreamChunk> = [];
      let transformedChunk: StreamChunk = chunk;

      if (type === "STEP_FINISHED") {
        const delta = (chunk as { delta?: string }).delta || "";
        if (delta) {
          accumulatedThinking += delta;
        }
        transformedChunk = {
          ...chunk,
          delta,
          content: accumulatedThinking,
        } as StreamChunk;
      } else if (type === "TEXT_MESSAGE_CONTENT") {
        const contentChunk = chunk as { content?: string; delta?: string };
        if (contentChunk.content) {
          accumulatedText = contentChunk.content;
        } else if (contentChunk.delta) {
          accumulatedText += contentChunk.delta;
        }
      } else if (type === "TOOL_CALL_START") {
        const toolStart = chunk as { toolCallId: string; toolName: string };
        toolCalls.set(toolStart.toolCallId, {
          name: toolStart.toolName,
          args: "",
        });
      } else if (type === "TOOL_CALL_ARGS") {
        const toolArgs = chunk as { toolCallId: string; delta: string };
        const toolCall = toolCalls.get(toolArgs.toolCallId);
        if (toolCall) {
          toolCall.args += toolArgs.delta;
        }
      } else if (type === "TOOL_CALL_END") {
        const toolEnd = chunk as {
          toolCallId: string;
          result?: string;
        };
        const toolCall = toolCalls.get(toolEnd.toolCallId);
        if (toolCall) {
          assistantParts.push({
            type: "tool-call",
            id: toolEnd.toolCallId,
            name: toolCall.name,
            arguments: toolCall.args,
            state: toolEnd.result ? "result" : "input-complete",
            output: toolEnd.result ? tryParseJson(toolEnd.result) : undefined,
          });
        }
      } else if (type === "RUN_ERROR") {
        streamError = getRunErrorMessage(chunk) ?? "Run failed";
        if (telemetry.status === "running") {
          telemetry.status = "failed";
          telemetry.error = streamError;
          telemetry.completedAt = Date.now();
          telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
        }
      } else if (type === "RUN_FINISHED") {
        const runFinishedChunk = chunk as {
          finishReason?: unknown;
          duration?: unknown;
        };
        if (telemetry.status === "running") {
          telemetry.status = "completed";
          telemetry.finishReason =
            typeof runFinishedChunk.finishReason === "string" ||
            runFinishedChunk.finishReason === null
              ? runFinishedChunk.finishReason
              : telemetry.finishReason;
          if (typeof runFinishedChunk.duration === "number") {
            telemetry.durationMs = runFinishedChunk.duration;
            telemetry.completedAt = telemetry.startedAt + runFinishedChunk.duration;
          } else {
            telemetry.completedAt = Date.now();
            telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
          }
        }
      }

      output.push(transformedChunk);

      const eagerTitleEvent = maybeEmitTitleEvent();
      if (eagerTitleEvent) {
        output.push(eagerTitleEvent);
      }

      if (!terminalEventsEmitted && (type === "RUN_FINISHED" || type === "RUN_ERROR")) {
        terminalEventsEmitted = true;
        const settledTitleEvent = await waitForTitleEvent();
        if (settledTitleEvent) {
          output.push(settledTitleEvent);
        }
        await finalizePersistence();
        output.push(...buildTerminalEvents());
      }

      return output.length === 1 ? output[0] : output;
    },
    async onFinish(_ctx, info) {
      telemetry.finishReason = info.finishReason;
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      if (telemetry.status === "running") {
        telemetry.status = "completed";
      }
      await finalizePersistence();
    },
    async onAbort(_ctx, info) {
      telemetry.status = "aborted";
      telemetry.error = info.reason;
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      await finalizePersistence();
    },
    async onError(_ctx, info) {
      telemetry.status = "failed";
      telemetry.error = info.error instanceof Error ? info.error.message : String(info.error);
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      await finalizePersistence();
    },
  };
}
