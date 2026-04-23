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
const REASONING_MODEL_NAME_PATTERN = /gpt-5|o[1-9]/;

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(value);
}

function getRunErrorFromChunk(chunk: StreamChunk): string | undefined {
  const errorValue = (chunk as { error?: unknown }).error;
  return errorValue ? asErrorMessage(errorValue) : undefined;
}

function getResolvedModelName(resolvedModel?: string): string {
  if (resolvedModel) return resolvedModel;
  const fallbackModel = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!fallbackModel) {
    throw new Error("AZURE_OPENAI_DEPLOYMENT is required");
  }
  return fallbackModel;
}

function createTelemetryMiddleware(
  telemetry: V2AgentRunTelemetry,
  log?: RequestLogger,
): ChatMiddleware {
  const safely = (hook: string, fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      log?.set({
        telemetryHook: hook,
        telemetryHookError: asErrorMessage(error),
      });
    }
  };

  return {
    name: "v2-runtime-telemetry",
    onStart(ctx) {
      telemetry.requestId = ctx.requestId;
      telemetry.streamId = ctx.streamId;
      telemetry.conversationId = ctx.conversationId;
      telemetry.provider = ctx.provider;
      telemetry.model = ctx.model;

      safely("onStart", () => {
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
      telemetry.iterationCount = Math.max(
        telemetry.iterationCount,
        info.iteration + 1,
      );
      safely("onIteration", () => {
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
      telemetry.toolCallCount += 1;
      telemetry.toolCalls.push({
        toolName: info.toolName,
        toolCallId: info.toolCallId,
        ok: info.ok,
        durationMs: info.duration,
        error: info.ok ? undefined : asErrorMessage(info.error),
      });
    },
    onUsage(_ctx, usage) {
      telemetry.usage = usage;
      safely("onUsage", () => {
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
      if (telemetry.status !== "running") return;
      telemetry.status = "failed";
      telemetry.error = getRunErrorFromChunk(chunk) ?? "Run failed";
      telemetry.completedAt = Date.now();
      telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
    },
    onFinish(_ctx, info: FinishInfo) {
      telemetry.finishReason = info.finishReason;
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      if (telemetry.status === "running") {
        telemetry.status = "completed";
      }

      safely("onFinish", () => {
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
      telemetry.status = "aborted";
      telemetry.error = info.reason;
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      safely("onAbort", () => {
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
      telemetry.status = "failed";
      telemetry.error = asErrorMessage(info.error);
      telemetry.durationMs = info.duration;
      telemetry.completedAt = telemetry.startedAt + info.duration;
      safely("onError", () => {
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
  const modelName = getResolvedModelName(resolvedModel);
  const supportsReasoning = REASONING_MODEL_NAME_PATTERN.test(modelName);
  const systemPrompts = profileConfig.buildSystemPrompts({
    extraSystemPrompts,
  });

  const telemetry: V2AgentRunTelemetry = {
    profile: V2_PROFILE,
    source: V2_SOURCE,
    status: "running",
    requestMessageCount: messages.length,
    iterationCount: 0,
    toolCallCount: 0,
    toolCalls: [],
    startedAt: Date.now(),
  };
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
