import { chat, generateMessageId } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { nanoid } from 'nanoid'
import { db } from '~/db'
import { threads, messages as messagesTable } from '~/db/schema'
import { eq, desc, count } from 'drizzle-orm'
import type { RequestLogger } from 'evlog'
import type { StreamChunk, MessagePart } from '@tanstack/ai'

export function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function getAzureAdapter(deployment?: string) {
  const model = deployment || process.env.AZURE_OPENAI_DEPLOYMENT!
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '')
  const baseURL = `${endpoint}/openai/v1`

  return createOpenaiChat(model as any, process.env.AZURE_OPENAI_API_KEY!, {
    baseURL,
  })
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
  userPrompt: string,
  toolName: string,
): Promise<string> {
  try {
    const adapter = getAzureAdapter()
    const stream = chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: `Generate a very short action phrase (3-6 words, present participle, no quotes) describing what's happening. The user asked: "${userPrompt}" and the tool "${toolName}" is being called. Example outputs: "Searching for employees", "Looking up pay history", "Checking certifications"`,
        },
      ],
    })
    let text = ''
    for await (const c of stream) {
      if (c.type === 'TEXT_MESSAGE_CONTENT' && c.delta) text += c.delta
    }
    return text.trim() || 'Using tools'
  } catch {
    return 'Using tools'
  }
}

export async function* withPersistence(
  stream: AsyncIterable<StreamChunk>,
  threadId: string,
  threadCreated: boolean,
  userContent: string,
  userParts: Array<MessagePart>,
  log: RequestLogger,
): AsyncIterable<StreamChunk> {
  if (threadCreated) {
    yield {
      type: 'CUSTOM' as const,
      name: 'thread_created',
      value: { threadId },
      timestamp: Date.now(),
    }
  }

  try {
    await persistUserMessage(threadId, userContent, userParts)
  } catch (err) {
    log.set({ persistUserError: String(err) })
  }

  let accumulated = ''
  let accumulatedThinking = ''
  let batchThinking = ''
  let pendingThinkingChunk: StreamChunk | null = null
  const assistantParts: Array<MessagePart> = []
  const toolCalls = new Map<string, { name: string; args: string }>()
  let summaryEmitted = false

  function* flushThinking(): Iterable<StreamChunk> {
    if (pendingThinkingChunk && batchThinking) {
      yield {
        ...pendingThinkingChunk,
        delta: batchThinking,
        content: accumulatedThinking,
      } as StreamChunk
    }
    batchThinking = ''
    pendingThinkingChunk = null
  }

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'STEP_FINISHED') {
        const delta = (chunk as { delta?: string }).delta || ''
        batchThinking += delta
        accumulatedThinking += delta
        pendingThinkingChunk = chunk
        continue
      }

      yield* flushThinking()

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
          const summary = await generateToolSummary(userContent, chunk.toolName)
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
        const { spec, specIndex } = chunk.value as { spec: unknown; specIndex: number }
        assistantParts.push({
          type: 'ui-spec' as 'text',
          content: JSON.stringify(spec),
          specIndex,
        } as MessagePart)
      }
      yield chunk
    }

    yield* flushThinking()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.set({ streamError: msg })
    console.error('>>> chatStream: Fatal error during response creation <<<')
    console.error('>>> Error message:', msg)
    if (err instanceof Error) console.error('>>> Error stack:', err.stack)
    console.error('>>> Full error:', err)
  }

  if (accumulatedThinking) {
    assistantParts.unshift({ type: 'thinking', content: accumulatedThinking } as MessagePart)
  }

  if (accumulated) {
    assistantParts.push({ type: 'text', content: accumulated })
  }

  if (assistantParts.length > 0) {
    try {
      await persistAssistantMessage(threadId, accumulated, assistantParts)
      maybeGenerateTitle(threadId, userContent).catch(() => {})
    } catch (err) {
      log.set({ persistAssistantError: String(err) })
    }
  }

  yield {
    type: 'CUSTOM' as const,
    name: 'persistence_complete',
    value: { threadId },
    timestamp: Date.now(),
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
