import {
  chat,
  maxIterations,
  type ChatMiddleware,
  type StreamChunk,
  type Tool,
} from "@tanstack/ai";
import { getAzureAdapter } from "~/shared/lib/openai-adapter";
import { resolveV2RuntimePolicy, type ResolvedV2RuntimePolicy } from "./policy";

export type V2AgentRunStatus =
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "aborted";

export interface V2AgentRunState {
  status: V2AgentRunStatus;
  finishReason?: string | null;
  error?: string;
}

export type V2AgentRunMessages = NonNullable<
  Parameters<typeof chat>[0]["messages"]
>;

type CreateV2AgentRunOptions = {
  messages: V2AgentRunMessages;
  conversationId?: string;
  model?: string;
  maxToolIterations?: number;
  runtimePolicy?: ResolvedV2RuntimePolicy;
  tools?: Array<Tool>;
  allowedToolNames?: Set<string>;
  middlewareFactory?: (runState: V2AgentRunState) => Array<ChatMiddleware>;
  context?: unknown;
  extraSystemPrompts?: Array<string>;
};

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
  const message = (chunk as { message?: unknown }).message;
  const code = (chunk as { code?: unknown }).code;
  const errorMessage =
    typeof message === "string" && message.trim().length > 0
      ? message
      : undefined;
  const errorCode =
    typeof code === "string" && code.trim().length > 0 ? code : undefined;

  if (errorMessage && errorCode) {
    return `${errorCode}: ${errorMessage}`;
  }
  if (errorMessage) {
    return errorMessage;
  }
  if (errorCode) {
    return errorCode;
  }
  return undefined;
}

function getResolvedModelName(resolvedModel?: string): string {
  if (resolvedModel) return resolvedModel;
  const fallbackModel = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!fallbackModel) {
    throw new Error("AZURE_OPENAI_DEPLOYMENT is required");
  }
  return fallbackModel;
}

function createRunStateMiddleware(
  runState: V2AgentRunState,
  allowedToolNames?: Set<string>,
): ChatMiddleware {
  return {
    name: "v2-run-state",
    onBeforeToolCall(_ctx, info) {
      if (allowedToolNames && !allowedToolNames.has(info.toolName)) {
        runState.status = "failed";
        runState.error = `Tool "${info.toolName}" is not allowed by V2 policy`;
        throw new Error(runState.error);
      }
    },
    onChunk(_ctx, chunk) {
      if ((chunk as { type?: unknown }).type !== "RUN_ERROR") return;
      if (runState.status !== "running") return;
      runState.status = "failed";
      runState.error = getRunErrorFromChunk(chunk) ?? "Run failed";
    },
    onFinish(_ctx, info) {
      runState.finishReason = info.finishReason;
      if (runState.status === "running") {
        runState.status = "completed";
      }
    },
    onAbort(_ctx, info) {
      runState.status = "aborted";
      runState.error = info.reason;
    },
    onError(_ctx, info) {
      runState.status = "failed";
      runState.error = asErrorMessage(info.error);
    },
  };
}

export async function createV2AgentRun({
  messages,
  conversationId,
  model,
  maxToolIterations,
  runtimePolicy,
  tools = [],
  allowedToolNames,
  middlewareFactory,
  context,
  extraSystemPrompts = [],
}: CreateV2AgentRunOptions): Promise<{
  stream: AsyncIterable<StreamChunk>;
  runState: V2AgentRunState;
}> {
  const resolvedRuntimePolicy =
    runtimePolicy ??
    resolveV2RuntimePolicy({
      data: { model, maxToolIterations },
      extraSystemPrompts,
    });
  const resolvedModel = resolvedRuntimePolicy.model;
  const adapter = getAzureAdapter(resolvedModel);
  const modelName = getResolvedModelName(resolvedModel);
  const supportsReasoning = REASONING_MODEL_NAME_PATTERN.test(modelName);
  const systemPrompts = resolvedRuntimePolicy.systemPrompts;

  const runState: V2AgentRunState = {
    status: "running",
  };

  const middleware = [
    createRunStateMiddleware(runState, allowedToolNames),
    ...(middlewareFactory?.(runState) ?? []),
  ];
  const iterationLimit = resolvedRuntimePolicy.maxToolIterations;

  const stream = chat({
    adapter,
    messages,
    conversationId,
    ...(tools.length > 0 ? { tools } : {}),
    ...(systemPrompts.length > 0 && { systemPrompts }),
    ...(iterationLimit
      ? { agentLoopStrategy: maxIterations(iterationLimit) }
      : {}),
    ...(!supportsReasoning && resolvedRuntimePolicy.temperature != null
      ? { temperature: resolvedRuntimePolicy.temperature }
      : {}),
    ...(supportsReasoning && {
      modelOptions: {
        reasoning: { effort: "low", summary: "auto" },
      },
    }),
    ...(context !== undefined && { context }),
    middleware,
  });

  return { stream, runState };
}
