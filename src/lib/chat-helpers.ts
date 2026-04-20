import { chat, generateMessageId } from '@tanstack/ai'
import { nanoid } from 'nanoid'
import { db } from '~/db'
import { threads, messages as messagesTable } from '~/db/schema'
import { eq, desc, count, asc } from 'drizzle-orm'
import type { RequestLogger } from 'evlog'
import type { StreamChunk, MessagePart } from '@tanstack/ai'
import type { AgentRunTelemetry } from '~/lib/agent-runner'
import {
  createRunMetadata,
  summarizeToolActivity,
} from '~/lib/agent-runtime-utils'
import { getAzureAdapter } from '~/lib/openai-adapter'
import {
  createChildSpan,
  finalizeAgentRunTrace,
  finishPersistenceSpan,
  startPersistenceSpan,
} from '~/lib/telemetry/agent-spans'
import {
  endTraceSpan,
  markTraceError,
  markTraceSuccess,
} from '~/lib/telemetry/otel'

const COLLECT_FORM_DATA_TOOL_NAME = 'collect_form_data'

function isWaitingForFormInput(
  telemetry: AgentRunTelemetry,
  streamError: string | null,
  assistantParts: Array<MessagePart>,
): boolean {
  if (streamError || telemetry.status !== 'running') return false
  return assistantParts.some((part) => {
    if ((part as { type?: string }).type !== 'tool-call') return false
    const toolPart = part as { name?: string; state?: string }
    return (
      toolPart.name === COLLECT_FORM_DATA_TOOL_NAME &&
      toolPart.state !== 'result'
    )
  })
}

function getRunTerminalEventName(
  status: AgentRunTelemetry['status'],
): 'run_complete' | 'run_aborted' | 'run_waiting_input' | 'run_error' {
  if (status === 'completed') return 'run_complete'
  if (status === 'aborted') return 'run_aborted'
  if (status === 'awaiting_input') return 'run_waiting_input'
  return 'run_error'
}

export function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export async function createThread(title: string, source?: string): Promise<string> {
  const now = new Date()
  const id = nanoid()
  await db.insert(threads).values({ id, title, source: source ?? null, createdAt: now, updatedAt: now })
  return id
}

export async function persistUserMessage(
  threadId: string,
  userContent: string,
  userParts: Array<MessagePart>,
  metadata?: Record<string, unknown>,
) {
  const latestMsg = await db
    .select({ id: messagesTable.id, role: messagesTable.role })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1)

  if (latestMsg.length > 0 && latestMsg[0].role === 'user') {
    return latestMsg[0].id
  }

  const id = generateMessageId()
  const now = new Date()
  await db.insert(messagesTable).values({
    id,
    threadId,
    role: 'user',
    content: userContent,
    parts: userParts,
    metadata,
    createdAt: now,
  })
  await db
    .update(threads)
    .set({ updatedAt: now })
    .where(eq(threads.id, threadId))
  return id
}

export async function persistAssistantMessage(
  threadId: string,
  content: string,
  parts: Array<MessagePart>,
  metadata?: Record<string, unknown>,
) {
  const latestMsg = await db
    .select({ role: messagesTable.role })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1)

  if (latestMsg.length === 0 || latestMsg[0].role !== 'user') {
    return
  }

  const id = generateMessageId()
  await db.insert(messagesTable).values({
    id,
    threadId,
    role: 'assistant',
    content,
    parts,
    metadata,
    createdAt: new Date(),
  })

  await db
    .update(threads)
    .set({ updatedAt: new Date() })
    .where(eq(threads.id, threadId))

  return id
}

export async function maybeGenerateTitle(threadId: string, userContent: string) {
  const msgCount = await db
    .select({ n: count() })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))

  if (msgCount[0].n > 2) return

  const [thread] = await db
    .select({ title: threads.title })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)

  if (!thread) return

  const isGenericTitle =
    thread.title === 'New Chat' || thread.title === userContent || thread.title.endsWith('...')

  if (!isGenericTitle) return

  try {
    const adapter = getAzureAdapter()
    const titleStream = chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: `Generate a short title (max 6 words, no quotes) for a conversation that starts with: "${userContent}"`,
        },
      ],
    })

    let title = ''
    for await (const chunk of titleStream) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        if (chunk.delta) title += chunk.delta
      }
    }

    title = title.replace(/^["']|["']$/g, '').trim()
    if (title) {
      await db.update(threads).set({ title }).where(eq(threads.id, threadId))
    }
  } catch {
    // Best-effort
  }
}

export async function generateToolSummary(
  toolName: string,
): Promise<string> {
  return summarizeToolActivity(toolName)
}

export async function loadThreadMessagesForRuntime(threadId: string) {
  const persisted = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(asc(messagesTable.createdAt))

  return persisted.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
    parts: message.parts ?? [{ type: 'text' as const, content: message.content }],
  }))
}

export async function* withPersistence(
  stream: AsyncIterable<StreamChunk>,
  threadId: string,
  threadCreated: boolean,
  userContent: string,
  userParts: Array<MessagePart>,
  log: RequestLogger,
  telemetry: AgentRunTelemetry,
): AsyncIterable<StreamChunk> {
  startPersistenceSpan(telemetry.traceState, {
    'agent.thread_id': threadId,
    'agent.thread_created': threadCreated,
  })

  const runPersistenceStep = async <T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T> => {
    const span = createChildSpan(telemetry.traceState, name, { attributes })
    try {
      const result = await fn()
      markTraceSuccess(span, attributes)
      return result
    } catch (error) {
      markTraceError(span, error, attributes)
      throw error
    } finally {
      endTraceSpan(span)
    }
  }

  try {
    if (threadCreated) {
      yield {
        type: 'CUSTOM' as const,
        name: 'thread_created',
        value: { threadId },
        timestamp: Date.now(),
      }
    }

    try {
      await runPersistenceStep(
        'agent.persistence.user_message',
        () =>
          persistUserMessage(
            threadId,
            userContent,
            userParts,
            createRunMetadata(telemetry),
          ),
        {
          'agent.thread_id': threadId,
          'agent.message_role': 'user',
        },
      )
    } catch (err) {
      log.set({ persistUserError: String(err) })
    }

    let accumulated = ''
    let accumulatedThinking = ''
    const assistantParts: Array<MessagePart> = []
    const toolCalls = new Map<string, { name: string; args: string }>()
    let summaryEmitted = false
    let streamError: string | null = null
    let persistenceError: string | null = null

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'STEP_FINISHED') {
          const delta = (chunk as { delta?: string }).delta || ''
          if (delta) accumulatedThinking += delta
          yield {
            ...chunk,
            delta,
            content: accumulatedThinking,
          } as StreamChunk
          continue
        }

        if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
          if (chunk.content) {
            accumulated = chunk.content
          } else if (chunk.delta) {
            accumulated += chunk.delta
          }
        } else if (chunk.type === 'TOOL_CALL_START') {
          toolCalls.set(chunk.toolCallId, { name: chunk.toolName, args: '' })
          if (!summaryEmitted) {
            summaryEmitted = true
            const summary = await generateToolSummary(chunk.toolName)
            assistantParts.push({
              type: 'tool-summary' as 'text',
              content: summary,
            })
            yield {
              type: 'CUSTOM' as const,
              name: 'tool_summary',
              value: { summary },
              timestamp: Date.now(),
            }
          }
        } else if (chunk.type === 'TOOL_CALL_ARGS') {
          const tc = toolCalls.get(chunk.toolCallId)
          if (tc) tc.args += chunk.delta
        } else if (chunk.type === 'TOOL_CALL_END') {
          const tc = toolCalls.get(chunk.toolCallId)
          if (tc) {
            assistantParts.push({
              type: 'tool-call',
              id: chunk.toolCallId,
              name: tc.name,
              arguments: tc.args,
              state: chunk.result ? 'result' : 'input-complete',
              output: chunk.result ? tryParseJSON(chunk.result) : undefined,
            } as MessagePart)
          }
        } else if (chunk.type === 'CUSTOM' && chunk.name === 'spec_complete') {
          const { spec, specIndex } = chunk.value as {
            spec: unknown
            specIndex: number
          }
          assistantParts.push({
            type: 'ui-spec' as 'text',
            content: JSON.stringify(spec),
            specIndex,
          } as MessagePart)
        }
        yield {
          ...chunk,
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err)
      if (telemetry.status === 'running') {
        telemetry.status = 'failed'
        telemetry.error = streamError
        telemetry.completedAt = Date.now()
        telemetry.durationMs = telemetry.completedAt - telemetry.startedAt
      }
      log.set({
        streamError,
        runStatus: telemetry.status,
      })
    }

    if (accumulatedThinking) {
      assistantParts.unshift({ type: 'thinking', content: accumulatedThinking } as MessagePart)
    }

    if (accumulated) {
      assistantParts.push({ type: 'text', content: accumulated })
    }

    if (isWaitingForFormInput(telemetry, streamError, assistantParts)) {
      telemetry.status = 'awaiting_input'
      telemetry.error = undefined
      telemetry.finishReason ??= 'tool_input_required'
      telemetry.completedAt = Date.now()
      telemetry.durationMs = telemetry.completedAt - telemetry.startedAt
    }

    if (assistantParts.length > 0) {
      try {
        await runPersistenceStep(
          'agent.persistence.assistant_message',
          () =>
            persistAssistantMessage(
              threadId,
              accumulated,
              assistantParts,
              createRunMetadata(telemetry, {
                error: streamError ?? undefined,
                partial: !!streamError,
              }),
            ),
          {
            'agent.thread_id': threadId,
            'agent.message_role': 'assistant',
            'agent.partial': !!streamError,
          },
        )
        if (!streamError && telemetry.status === 'completed') {
          maybeGenerateTitle(threadId, userContent).catch(() => {})
        }
      } catch (err) {
        persistenceError = err instanceof Error ? err.message : String(err)
        log.set({ persistAssistantError: persistenceError })
      }
    }

    yield {
      type: 'CUSTOM' as const,
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
    }

    yield {
      type: 'CUSTOM' as const,
      name: 'persistence_complete',
      value: {
        threadId,
        status: telemetry.status,
        error: streamError ?? persistenceError ?? telemetry.error ?? null,
        traceId: telemetry.traceId ?? null,
      },
      timestamp: Date.now(),
    }

    const finalError =
      persistenceError ??
      streamError ??
      (telemetry.status === 'failed' || telemetry.status === 'aborted'
        ? telemetry.error
        : undefined)

    finishPersistenceSpan(telemetry.traceState, {
      error: finalError,
      attributes: {
        'agent.status': telemetry.status,
        'agent.thread_id': threadId,
      },
    })
    finalizeAgentRunTrace(telemetry.traceState, {
      error: finalError,
      attributes: {
        'agent.status': telemetry.status,
        'agent.thread_id': threadId,
        'agent.tool_call_count': telemetry.toolCallCount,
        'agent.iteration_count': telemetry.iterationCount,
      },
    })
  } finally {
    if (!telemetry.traceState?.completed) {
      finishPersistenceSpan(telemetry.traceState, {
        error: telemetry.error,
        attributes: {
          'agent.status': telemetry.status,
          'agent.thread_id': threadId,
        },
      })
      finalizeAgentRunTrace(telemetry.traceState, {
        error: telemetry.error,
        attributes: {
          'agent.status': telemetry.status,
          'agent.thread_id': threadId,
        },
      })
    }
  }
}

export function extractUserMessage(messages: Array<any>): {
  content: string
  parts: Array<MessagePart>
} {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: any) => m.role === 'user')

  if (!lastUserMessage) return { content: '', parts: [] }

  if (typeof lastUserMessage.content === 'string') {
    return {
      content: lastUserMessage.content,
      parts: [{ type: 'text', content: lastUserMessage.content }],
    }
  }

  if (Array.isArray(lastUserMessage.parts)) {
    const textContent = lastUserMessage.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.content)
      .join('')
    return {
      content: textContent,
      parts: lastUserMessage.parts,
    }
  }

  return { content: '', parts: [] }
}
