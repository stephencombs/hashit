import type { RequestLogger } from 'evlog'
import { SpanKind, type Span } from '@opentelemetry/api'
import type { AgentRunProfile } from '~/lib/agent-profile-policy'
import {
  endTraceSpan,
  markTraceError,
  markTraceSuccess,
  setTraceAttributes,
  startTraceSpan,
} from './otel'

export type AgentTraceSource =
  | 'interactive-chat'
  | 'interactive-chat-v2'
  | 'automation-api'
  | 'automation-executor'
  | 'dashboard-generation'
  | 'dashboard-planning'
  | 'dashboard-render'

export interface AgentTraceState {
  source: AgentTraceSource
  traceId?: string
  spanId?: string
  rootSpan: Span
  currentIterationSpan?: Span
  persistenceSpan?: Span
  toolSpans: Map<string, Span>
  completed: boolean
}

export function bindTraceToLogger(
  log: RequestLogger | undefined,
  traceState: AgentTraceState | undefined,
  extra?: Record<string, unknown>,
) {
  if (!log || !traceState) return

  log.set({
    traceId: traceState.traceId,
    spanId: traceState.spanId,
    ...extra,
  })
}

export function startAgentRunTrace(options: {
  profile: AgentRunProfile
  source: AgentTraceSource
  parentSpan?: Span
  conversationId?: string
  requestId?: string
  streamId?: string
  log?: RequestLogger
  attributes?: Record<string, unknown>
}): AgentTraceState {
  const started = startTraceSpan('agent.run', {
    parentSpan: options.parentSpan,
    kind: SpanKind.INTERNAL,
    attributes: {
      'agent.profile': options.profile,
      'agent.source': options.source,
      'agent.conversation_id': options.conversationId,
      'agent.request_id': options.requestId,
      'agent.stream_id': options.streamId,
      ...options.attributes,
    },
  })

  const traceState: AgentTraceState = {
    source: options.source,
    traceId: started.traceId,
    spanId: started.spanId,
    rootSpan: started.span,
    toolSpans: new Map(),
    completed: false,
  }

  bindTraceToLogger(options.log, traceState, {
    traceSource: options.source,
  })

  return traceState
}

export function startIterationSpan(
  traceState: AgentTraceState | undefined,
  attributes?: Record<string, unknown>,
) {
  if (!traceState) return

  endIterationSpan(traceState)
  traceState.currentIterationSpan = startTraceSpan('agent.iteration', {
    parentSpan: traceState.rootSpan,
    attributes,
  }).span
}

export function endIterationSpan(
  traceState: AgentTraceState | undefined,
  options?: {
    error?: unknown
    attributes?: Record<string, unknown>
  },
) {
  if (!traceState?.currentIterationSpan) return

  if (options?.error) {
    markTraceError(traceState.currentIterationSpan, options.error, options.attributes)
  } else {
    markTraceSuccess(traceState.currentIterationSpan, options?.attributes)
  }

  endTraceSpan(traceState.currentIterationSpan)
  traceState.currentIterationSpan = undefined
}

export function startToolSpan(
  traceState: AgentTraceState | undefined,
  toolCallId: string,
  attributes?: Record<string, unknown>,
) {
  if (!traceState) return

  const span = startTraceSpan('agent.tool', {
    parentSpan: traceState.currentIterationSpan ?? traceState.rootSpan,
    attributes,
  }).span
  traceState.toolSpans.set(toolCallId, span)
}

export function finishToolSpan(
  traceState: AgentTraceState | undefined,
  toolCallId: string,
  options?: {
    ok?: boolean
    error?: unknown
    attributes?: Record<string, unknown>
  },
) {
  const span = traceState?.toolSpans.get(toolCallId)
  if (!span || !traceState) return

  if (options?.ok === false || options?.error) {
    markTraceError(span, options?.error ?? 'Tool call failed', options?.attributes)
  } else {
    markTraceSuccess(span, options?.attributes)
  }

  endTraceSpan(span)
  traceState.toolSpans.delete(toolCallId)
}

export function startPersistenceSpan(
  traceState: AgentTraceState | undefined,
  attributes?: Record<string, unknown>,
) {
  if (!traceState || traceState.persistenceSpan) return

  traceState.persistenceSpan = startTraceSpan('agent.persistence', {
    parentSpan: traceState.rootSpan,
    attributes,
  }).span
}

export function finishPersistenceSpan(
  traceState: AgentTraceState | undefined,
  options?: {
    error?: unknown
    attributes?: Record<string, unknown>
  },
) {
  if (!traceState?.persistenceSpan) return

  if (options?.error) {
    markTraceError(traceState.persistenceSpan, options.error, options.attributes)
  } else {
    markTraceSuccess(traceState.persistenceSpan, options?.attributes)
  }

  endTraceSpan(traceState.persistenceSpan)
  traceState.persistenceSpan = undefined
}

export function createChildSpan(
  traceState: AgentTraceState | undefined,
  name: string,
  options?: {
    parentSpan?: Span
    attributes?: Record<string, unknown>
  },
) {
  if (!traceState) return undefined

  return startTraceSpan(name, {
    parentSpan:
      options?.parentSpan ?? traceState.persistenceSpan ?? traceState.rootSpan,
    attributes: options?.attributes,
  }).span
}

export function finalizeAgentRunTrace(
  traceState: AgentTraceState | undefined,
  options?: {
    error?: unknown
    attributes?: Record<string, unknown>
  },
) {
  if (!traceState || traceState.completed) return

  finishPersistenceSpan(traceState)
  for (const toolCallId of [...traceState.toolSpans.keys()]) {
    finishToolSpan(traceState, toolCallId, {
      ok: false,
      error: options?.error ?? 'Tool span closed before completion',
      attributes: { 'agent.tool.unfinished': true },
    })
  }
  endIterationSpan(traceState)

  if (options?.error) {
    markTraceError(traceState.rootSpan, options.error, options.attributes)
  } else {
    setTraceAttributes(traceState.rootSpan, options?.attributes)
  }
  endTraceSpan(traceState.rootSpan)
  traceState.completed = true
}
