import {
  chat,
  maxIterations,
  type ChatMiddleware,
  type ErrorInfo,
  type FinishInfo,
  type Tool,
  type StreamChunk,
  type UsageInfo,
} from '@tanstack/ai'
import type { Span } from '@opentelemetry/api'
import type { RequestLogger } from 'evlog'
import { createPlanTool } from '~/lib/tools'
import { collectFormDataTool } from '~/lib/form-tool'
import { getMcpTools, type GetMcpToolsOptions } from '~/lib/mcp/client'
import { getAzureAdapter } from '~/lib/openai-adapter'
import {
  PROFILE_CONFIGS,
  resolveAgentModel,
  sanitizeCustomSystemPrompt,
  type AgentRunProfile,
} from '~/lib/agent-profile-policy'
import {
  bindTraceToLogger,
  endIterationSpan,
  finishToolSpan,
  startAgentRunTrace,
  startIterationSpan,
  startToolSpan,
  type AgentTraceSource,
  type AgentTraceState,
} from '~/lib/telemetry/agent-spans'
import {
  markTraceError,
  markTraceSuccess,
  setTraceAttributes,
} from '~/lib/telemetry/otel'

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'aborted'

export interface AgentToolCallTelemetry {
  toolName: string
  toolCallId: string
  ok: boolean
  durationMs: number
  error?: string
}

export interface AgentRunTelemetry {
  profile: AgentRunProfile
  source: AgentTraceSource
  status: AgentRunStatus
  requestId?: string
  streamId?: string
  conversationId?: string
  provider?: string
  model?: string
  traceId?: string
  spanId?: string
  requestMessageCount: number
  iterationCount: number
  toolCallCount: number
  toolCalls: AgentToolCallTelemetry[]
  mcpServersUsed: string[]
  finishReason?: string | null
  usage?: UsageInfo
  durationMs?: number
  error?: string
  startedAt: number
  completedAt?: number
  traceState?: AgentTraceState
}

interface CreateAgentRunOptions {
  profile: AgentRunProfile
  source?: AgentTraceSource
  messages: Array<any>
  conversationId?: string
  model?: string
  temperature?: number
  customSystemPrompt?: string
  selectedServers?: string[]
  enabledTools?: Record<string, string[]>
  extraTools?: Tool[]
  extraSystemPrompts?: string[]
  maxToolIterations?: number
  log?: RequestLogger
  parentSpan?: Span
  traceState?: AgentTraceState
}

export function createAgentRunTelemetry(
  profile: AgentRunProfile,
  messageCount: number,
  source: AgentTraceSource,
): AgentRunTelemetry {
  return {
    profile,
    source,
    status: 'running',
    requestMessageCount: messageCount,
    iterationCount: 0,
    toolCallCount: 0,
    toolCalls: [],
    mcpServersUsed: [],
    startedAt: Date.now(),
  }
}

function createTelemetryMiddleware(
  telemetry: AgentRunTelemetry,
  log?: RequestLogger,
  allowedToolNames?: Set<string>,
): ChatMiddleware {
  const safely = (fn: () => void) => {
    try {
      fn()
    } catch (error) {
      log?.set({
        telemetryHookError:
          error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    name: 'agent-runtime-telemetry',
    onStart(ctx) {
      safely(() => {
        telemetry.requestId = ctx.requestId
        telemetry.streamId = ctx.streamId
        telemetry.conversationId = ctx.conversationId
        telemetry.provider = ctx.provider
        telemetry.model = ctx.model

        setTraceAttributes(telemetry.traceState?.rootSpan, {
          'agent.request_id': ctx.requestId,
          'agent.stream_id': ctx.streamId,
          'agent.conversation_id': ctx.conversationId,
          'llm.provider': ctx.provider,
          'llm.model': ctx.model,
          'agent.tool_names': ctx.toolNames,
        })
        bindTraceToLogger(log, telemetry.traceState, {
          runProfile: telemetry.profile,
          runRequestId: ctx.requestId,
          runStreamId: ctx.streamId,
          conversationId: ctx.conversationId,
          provider: ctx.provider,
          model: ctx.model,
          requestMessageCount: telemetry.requestMessageCount,
          toolNames: ctx.toolNames,
        })
      })
    },
    onIteration(_ctx, info) {
      safely(() => {
        telemetry.iterationCount = Math.max(
          telemetry.iterationCount,
          info.iteration + 1,
        )
        startIterationSpan(telemetry.traceState, {
          'agent.iteration': info.iteration + 1,
          'agent.message_id': info.messageId,
        })
        log?.set({
          agentIteration: info.iteration + 1,
          agentMessageId: info.messageId,
        })
      })
    },
    onBeforeToolCall(_ctx, hookCtx) {
      if (allowedToolNames && !allowedToolNames.has(hookCtx.toolName)) {
        safely(() => {
          setTraceAttributes(telemetry.traceState?.rootSpan, {
            'agent.blocked_tool': hookCtx.toolName,
          })
          log?.set({
            blockedToolName: hookCtx.toolName,
          })
        })
        return {
          type: 'abort' as const,
          reason: `Tool blocked by profile policy: ${hookCtx.toolName}`,
        }
      }

      safely(() => {
        startToolSpan(telemetry.traceState, hookCtx.toolCallId, {
          'tool.name': hookCtx.toolName,
          'tool.call_id': hookCtx.toolCallId,
        })
      })
      return undefined
    },
    onAfterToolCall(_ctx, info) {
      safely(() => {
        telemetry.toolCallCount += 1
        const toolCall = {
          toolName: info.toolName,
          toolCallId: info.toolCallId,
          ok: info.ok,
          durationMs: info.duration,
          error: info.ok
            ? undefined
            : info.error instanceof Error
              ? info.error.message
              : String(info.error),
        }
        telemetry.toolCalls.push(toolCall)
        if (info.toolName.includes('__')) {
          const serverName = info.toolName.split('__')[0]
          if (serverName && !telemetry.mcpServersUsed.includes(serverName)) {
            telemetry.mcpServersUsed.push(serverName)
          }
        }
        finishToolSpan(telemetry.traceState, info.toolCallId, {
          ok: info.ok,
          error: info.ok ? undefined : info.error,
          attributes: {
            'tool.name': info.toolName,
            'tool.call_id': info.toolCallId,
            'tool.duration_ms': info.duration,
            'tool.ok': info.ok,
          },
        })
        log?.set({
          lastToolName: info.toolName,
          lastToolDurationMs: info.duration,
          lastToolOk: info.ok,
          toolCallCount: telemetry.toolCallCount,
        })
      })
    },
    onUsage(_ctx, usage) {
      safely(() => {
        telemetry.usage = usage
        setTraceAttributes(telemetry.traceState?.rootSpan, {
          'llm.prompt_tokens': usage.promptTokens,
          'llm.completion_tokens': usage.completionTokens,
          'llm.total_tokens': usage.totalTokens,
        })
        log?.set({
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        })
      })
    },
    onFinish(_ctx, info: FinishInfo) {
      safely(() => {
        telemetry.status = 'completed'
        telemetry.finishReason = info.finishReason
        telemetry.durationMs = info.duration
        telemetry.completedAt = telemetry.startedAt + info.duration
        endIterationSpan(telemetry.traceState, {
          attributes: {
            'agent.finish_reason': info.finishReason,
          },
        })
        markTraceSuccess(telemetry.traceState?.rootSpan, {
          'agent.status': telemetry.status,
          'agent.finish_reason': info.finishReason,
          'agent.duration_ms': info.duration,
          'agent.tool_call_count': telemetry.toolCallCount,
          'agent.iteration_count': telemetry.iterationCount,
          'agent.mcp_servers': telemetry.mcpServersUsed,
        })
        log?.set({
          runStatus: telemetry.status,
          finishReason: info.finishReason,
          durationMs: info.duration,
          toolCallCount: telemetry.toolCallCount,
          iterationCount: telemetry.iterationCount,
          mcpServersUsed: telemetry.mcpServersUsed,
        })
      })
    },
    onAbort(_ctx, info) {
      safely(() => {
        telemetry.status = 'aborted'
        telemetry.error = info.reason
        telemetry.durationMs = info.duration
        telemetry.completedAt = telemetry.startedAt + info.duration
        endIterationSpan(telemetry.traceState, {
          error: info.reason,
          attributes: {
            'agent.abort_reason': info.reason,
          },
        })
        markTraceError(telemetry.traceState?.rootSpan, info.reason, {
          'agent.status': telemetry.status,
          'agent.duration_ms': info.duration,
        })
        log?.set({
          runStatus: telemetry.status,
          durationMs: info.duration,
          abortReason: info.reason,
        })
      })
    },
    onError(_ctx, info: ErrorInfo) {
      safely(() => {
        telemetry.status = 'failed'
        telemetry.error =
          info.error instanceof Error ? info.error.message : String(info.error)
        telemetry.durationMs = info.duration
        telemetry.completedAt = telemetry.startedAt + info.duration
        endIterationSpan(telemetry.traceState, {
          error: info.error,
        })
        markTraceError(telemetry.traceState?.rootSpan, info.error, {
          'agent.status': telemetry.status,
          'agent.duration_ms': info.duration,
          'agent.tool_call_count': telemetry.toolCallCount,
          'agent.iteration_count': telemetry.iterationCount,
        })
        log?.set({
          runStatus: telemetry.status,
          durationMs: info.duration,
          runError: telemetry.error,
          toolCallCount: telemetry.toolCallCount,
          iterationCount: telemetry.iterationCount,
        })
      })
    },
  }
}

function getDefaultTraceSource(
  profile: AgentRunProfile,
): AgentTraceSource {
  switch (profile) {
    case 'interactiveChat':
      return 'interactive-chat'
    case 'dashboardPlanning':
      return 'dashboard-planning'
    case 'dashboardRender':
      return 'dashboard-render'
    case 'automation':
    default:
      return 'automation-executor'
  }
}

export async function createAgentRun({
  profile,
  source,
  messages,
  conversationId,
  model,
  temperature,
  customSystemPrompt,
  selectedServers,
  enabledTools,
  extraTools = [],
  extraSystemPrompts = [],
  maxToolIterations,
  log,
  parentSpan,
  traceState: providedTraceState,
}: CreateAgentRunOptions): Promise<{
  stream: AsyncIterable<StreamChunk>
  telemetry: AgentRunTelemetry
}> {
  const profileConfig = PROFILE_CONFIGS[profile]
  const resolvedModel = resolveAgentModel(profile, model)
  const adapter = getAzureAdapter(resolvedModel)
  const modelName = resolvedModel || process.env.AZURE_OPENAI_DEPLOYMENT!
  const supportsReasoning = /gpt-5|o[1-9]/.test(modelName)

  const sanitizedPrompt = profileConfig.allowCustomSystemPrompt
    ? sanitizeCustomSystemPrompt(customSystemPrompt)
    : undefined

  const systemPrompts = profileConfig.buildSystemPrompts({
    customSystemPrompt: sanitizedPrompt,
    extraSystemPrompts,
  })

  const mcpOptions: GetMcpToolsOptions = {
    lazy: profileConfig.lazyMcpTools,
  }
  const mcpTools =
    profileConfig.includeMcpTools
      ? await getMcpTools(selectedServers, enabledTools, mcpOptions)
      : []

  const tools: Tool[] = [
    ...(profileConfig.includePlanTool ? [createPlanTool] : []),
    ...(profileConfig.includeFormTool ? [collectFormDataTool] : []),
    ...extraTools,
    ...mcpTools,
  ]

  const traceSource = source ?? getDefaultTraceSource(profile)
  const telemetry = createAgentRunTelemetry(profile, messages.length, traceSource)
  const allowedToolNames = new Set(tools.map((tool) => tool.name))
  const traceState =
    providedTraceState ??
    startAgentRunTrace({
      profile,
      source: traceSource,
      parentSpan,
      conversationId,
      log,
      attributes: {
        'agent.message_count': messages.length,
        'agent.tool_count': tools.length,
      },
    })
  telemetry.traceState = traceState
  telemetry.traceId = traceState.traceId
  telemetry.spanId = traceState.spanId

  const stream = chat({
    adapter,
    messages,
    conversationId,
    ...(!supportsReasoning &&
      profileConfig.allowTemperatureOverride &&
      temperature !== undefined && { temperature }),
    ...(systemPrompts.length > 0 && { systemPrompts }),
    ...(tools.length > 0 && { tools }),
    ...(maxToolIterations || profileConfig.defaultMaxIterations
      ? {
          agentLoopStrategy: maxIterations(
            maxToolIterations ?? profileConfig.defaultMaxIterations!,
          ),
        }
      : {}),
    ...(supportsReasoning && {
      modelOptions: {
        reasoning: { effort: 'low', summary: 'auto' },
      },
    }),
    middleware: [
      createTelemetryMiddleware(telemetry, log, allowedToolNames),
    ],
  })

  return { stream, telemetry }
}
