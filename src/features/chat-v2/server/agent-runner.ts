import {
  chat,
  maxIterations,
  type ChatMiddleware,
  type ErrorInfo,
  type FinishInfo,
  type StreamChunk,
  type UsageInfo,
} from "@tanstack/ai";
import type { RequestLogger } from "evlog";
import {
  PROFILE_CONFIGS,
  resolveAgentModel,
  type AgentRunProfile,
} from "~/lib/agent-profile-policy";
import { getAzureAdapter } from "~/lib/openai-adapter";
import {
  bindTraceToLogger,
  endIterationSpan,
  startAgentRunTrace,
  startIterationSpan,
  type AgentTraceSource,
  type AgentTraceState,
} from "~/lib/telemetry/agent-spans";
import {
  markTraceError,
  markTraceSuccess,
  setTraceAttributes,
} from "~/lib/telemetry/otel";

export type V2AgentRunStatus =
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "aborted";

interface V2AgentToolCallTelemetry {
  toolName: string;
  toolCallId: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface V2AgentRunTelemetry {
  profile: AgentRunProfile;
  source: AgentTraceSource;
  status: V2AgentRunStatus;
  requestId?: string;
  streamId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  traceId?: string;
  spanId?: string;
  requestMessageCount: number;
  iterationCount: number;
  toolCallCount: number;
  toolCalls: Array<V2AgentToolCallTelemetry>;
  finishReason?: string | null;
  usage?: UsageInfo;
  durationMs?: number;
  error?: string;
  startedAt: number;
  completedAt?: number;
  traceState?: AgentTraceState;
}

type CreateV2AgentRunOptions = {
  messages: Array<Record<string, unknown>>;
  conversationId?: string;
  model?: string;
  log?: RequestLogger;
  maxToolIterations?: number;
  middlewareFactory?: (
    telemetry: V2AgentRunTelemetry,
  ) => Array<ChatMiddleware>;
  context?: unknown;
  extraSystemPrompts?: Array<string>;
};

const V2_PROFILE: AgentRunProfile = "interactiveChatV2";
const V2_SOURCE: AgentTraceSource = "interactive-chat-v2";

function createV2RunTelemetry(messageCount: number): V2AgentRunTelemetry {
  return {
    profile: V2_PROFILE,
    source: V2_SOURCE,
    status: "running",
    requestMessageCount: messageCount,
    iterationCount: 0,
    toolCallCount: 0,
    toolCalls: [],
    startedAt: Date.now(),
  };
}

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}

function getRunErrorFromChunk(chunk: StreamChunk): string | undefined {
  const candidate = chunk as {
    error?: {
      message?: unknown;
    } | unknown;
  };

  const errorValue = candidate.error;
  if (!errorValue) return undefined;
  if (errorValue instanceof Error) return errorValue.message;
  if (typeof errorValue === "string") return errorValue;
  if (
    typeof errorValue === "object" &&
    errorValue !== null &&
    "message" in errorValue
  ) {
    const message = (errorValue as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(errorValue);
}

function createTelemetryMiddleware(
  telemetry: V2AgentRunTelemetry,
  log?: RequestLogger,
): ChatMiddleware {
  const safely = (fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      log?.set({
        telemetryHookError: asErrorMessage(error),
      });
    }
  };

  return {
    name: "v2-runtime-telemetry",
    onStart(ctx) {
      safely(() => {
        telemetry.requestId = ctx.requestId;
        telemetry.streamId = ctx.streamId;
        telemetry.conversationId = ctx.conversationId;
        telemetry.provider = ctx.provider;
        telemetry.model = ctx.model;

        setTraceAttributes(telemetry.traceState?.rootSpan, {
          "agent.request_id": ctx.requestId,
          "agent.stream_id": ctx.streamId,
          "agent.conversation_id": ctx.conversationId,
          "llm.provider": ctx.provider,
          "llm.model": ctx.model,
        });
        bindTraceToLogger(log, telemetry.traceState, {
          runProfile: telemetry.profile,
          runRequestId: ctx.requestId,
          runStreamId: ctx.streamId,
          conversationId: ctx.conversationId,
          provider: ctx.provider,
          model: ctx.model,
          requestMessageCount: telemetry.requestMessageCount,
        });
      });
    },
    onIteration(_ctx, info) {
      safely(() => {
        telemetry.iterationCount = Math.max(
          telemetry.iterationCount,
          info.iteration + 1,
        );
        startIterationSpan(telemetry.traceState, {
          "agent.iteration": info.iteration + 1,
          "agent.message_id": info.messageId,
        });
        log?.set({
          agentIteration: info.iteration + 1,
          agentMessageId: info.messageId,
        });
      });
    },
    onAfterToolCall(_ctx, info) {
      safely(() => {
        telemetry.toolCallCount += 1;
        telemetry.toolCalls.push({
          toolName: info.toolName,
          toolCallId: info.toolCallId,
          ok: info.ok,
          durationMs: info.duration,
          error: info.ok ? undefined : asErrorMessage(info.error),
        });
      });
    },
    onUsage(_ctx, usage) {
      safely(() => {
        telemetry.usage = usage;
        setTraceAttributes(telemetry.traceState?.rootSpan, {
          "llm.prompt_tokens": usage.promptTokens,
          "llm.completion_tokens": usage.completionTokens,
          "llm.total_tokens": usage.totalTokens,
        });
        log?.set({
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        });
      });
    },
    onChunk(_ctx, chunk) {
      if ((chunk as { type?: unknown }).type !== "RUN_ERROR") return;
      safely(() => {
        if (telemetry.status !== "running") return;
        telemetry.status = "failed";
        telemetry.error = getRunErrorFromChunk(chunk) ?? "Run failed";
        telemetry.completedAt = Date.now();
        telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
      });
    },
    onFinish(_ctx, info: FinishInfo) {
      safely(() => {
        telemetry.finishReason = info.finishReason;
        telemetry.durationMs = info.duration;
        telemetry.completedAt = telemetry.startedAt + info.duration;
        if (telemetry.status === "running") {
          telemetry.status = "completed";
        }

        endIterationSpan(telemetry.traceState, {
          attributes: {
            "agent.finish_reason": info.finishReason,
          },
        });

        if (telemetry.status === "completed") {
          markTraceSuccess(telemetry.traceState?.rootSpan, {
            "agent.status": telemetry.status,
            "agent.finish_reason": info.finishReason,
            "agent.duration_ms": info.duration,
            "agent.tool_call_count": telemetry.toolCallCount,
            "agent.iteration_count": telemetry.iterationCount,
          });
        } else {
          markTraceError(
            telemetry.traceState?.rootSpan,
            telemetry.error ?? "Run completed with non-success status",
            {
              "agent.status": telemetry.status,
              "agent.finish_reason": info.finishReason,
              "agent.duration_ms": info.duration,
            },
          );
        }

        log?.set({
          runStatus: telemetry.status,
          finishReason: info.finishReason,
          durationMs: info.duration,
          toolCallCount: telemetry.toolCallCount,
          iterationCount: telemetry.iterationCount,
        });
      });
    },
    onAbort(_ctx, info) {
      safely(() => {
        telemetry.status = "aborted";
        telemetry.error = info.reason;
        telemetry.durationMs = info.duration;
        telemetry.completedAt = telemetry.startedAt + info.duration;
        endIterationSpan(telemetry.traceState, {
          error: info.reason,
          attributes: {
            "agent.abort_reason": info.reason,
          },
        });
        markTraceError(telemetry.traceState?.rootSpan, info.reason, {
          "agent.status": telemetry.status,
          "agent.duration_ms": info.duration,
        });
        log?.set({
          runStatus: telemetry.status,
          durationMs: info.duration,
          abortReason: info.reason,
        });
      });
    },
    onError(_ctx, info: ErrorInfo) {
      safely(() => {
        telemetry.status = "failed";
        telemetry.error = asErrorMessage(info.error);
        telemetry.durationMs = info.duration;
        telemetry.completedAt = telemetry.startedAt + info.duration;
        endIterationSpan(telemetry.traceState, {
          error: info.error,
        });
        markTraceError(telemetry.traceState?.rootSpan, info.error, {
          "agent.status": telemetry.status,
          "agent.duration_ms": info.duration,
          "agent.tool_call_count": telemetry.toolCallCount,
          "agent.iteration_count": telemetry.iterationCount,
        });
        log?.set({
          runStatus: telemetry.status,
          durationMs: info.duration,
          runError: telemetry.error,
          toolCallCount: telemetry.toolCallCount,
          iterationCount: telemetry.iterationCount,
        });
      });
    },
  };
}

export async function createV2AgentRun({
  messages,
  conversationId,
  model,
  log,
  maxToolIterations,
  middlewareFactory,
  context,
  extraSystemPrompts = [],
}: CreateV2AgentRunOptions): Promise<{
  stream: AsyncIterable<StreamChunk>;
  telemetry: V2AgentRunTelemetry;
}> {
  const profileConfig = PROFILE_CONFIGS[V2_PROFILE];
  const resolvedModel = resolveAgentModel(V2_PROFILE, model);
  const adapter = getAzureAdapter(resolvedModel);
  const modelName = resolvedModel || process.env.AZURE_OPENAI_DEPLOYMENT!;
  const supportsReasoning = /gpt-5|o[1-9]/.test(modelName);
  const systemPrompts = profileConfig.buildSystemPrompts({
    extraSystemPrompts,
  });

  const telemetry = createV2RunTelemetry(messages.length);
  const traceState = startAgentRunTrace({
    profile: V2_PROFILE,
    source: V2_SOURCE,
    conversationId,
    log,
    attributes: {
      "agent.message_count": messages.length,
    },
  });
  telemetry.traceState = traceState;
  telemetry.traceId = traceState.traceId;
  telemetry.spanId = traceState.spanId;

  const middleware = [
    createTelemetryMiddleware(telemetry, log),
    ...(middlewareFactory?.(telemetry) ?? []),
  ];
  const iterationLimit = maxToolIterations ?? profileConfig.defaultMaxIterations;

  const stream = chat({
    adapter,
    messages,
    conversationId,
    ...(systemPrompts.length > 0 && { systemPrompts }),
    ...(iterationLimit ? { agentLoopStrategy: maxIterations(iterationLimit) } : {}),
    ...(supportsReasoning && {
      modelOptions: {
        reasoning: { effort: "low", summary: "auto" },
      },
    }),
    ...(context !== undefined && { context }),
    middleware,
  });

  return { stream, telemetry };
}
