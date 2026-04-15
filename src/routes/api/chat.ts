import { chat, generateMessageId, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { nanoid } from 'nanoid'
import { db } from '~/db'
import { threads, messages as messagesTable } from '~/db/schema'
import { eq, desc, count } from 'drizzle-orm'
import { chatRequestSchema } from '~/lib/schemas'
import { createPlanTool } from '~/lib/tools'
import { collectFormDataTool } from '~/lib/form-tool'
import { uiCatalog } from '~/lib/ui-catalog'
import { withJsonRender } from '~/lib/json-render-stream'
import { getMcpTools } from '~/lib/mcp/client'
import type { RequestLogger } from 'evlog'
import type { StreamChunk, MessagePart } from '@tanstack/ai'

function getAzureAdapter(deployment?: string) {
  const model = deployment || process.env.AZURE_OPENAI_DEPLOYMENT!
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '')
  const baseURL = `${endpoint}/openai/v1`

  return createOpenaiChat(model as any, process.env.AZURE_OPENAI_API_KEY!, {
    baseURL,
  })
}

async function createThread(title: string): Promise<string> {
  const now = new Date()
  const id = nanoid()
  await db.insert(threads).values({ id, title, createdAt: now, updatedAt: now })
  return id
}

async function persistUserMessage(
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

async function persistAssistantMessage(
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

async function maybeGenerateTitle(threadId: string, userContent: string) {
  const msgCount = await db
    .select({ n: count() })
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))

  if (msgCount[0].n > 2) return

  const thread = await db
    .select({ title: threads.title })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get()

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

async function generateToolSummary(
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

/**
 * Stops the agent loop stream as soon as collect_form_data completes.
 * Without this, TanStack AI's agent loop sees a completed tool call and
 * runs the LLM again, causing it to call the form tool a second (or third)
 * time before the user has had a chance to fill the form.
 */
async function* withFormStop(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const formToolCallIds = new Set<string>()
  for await (const chunk of stream) {
    yield chunk
    if (chunk.type === 'TOOL_CALL_START' && chunk.toolName === 'collect_form_data') {
      formToolCallIds.add(chunk.toolCallId)
    }
    if (chunk.type === 'TOOL_CALL_END' && formToolCallIds.has(chunk.toolCallId)) {
      return
    }
  }
}

async function* withPersistence(
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
  let streamError: unknown = null
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
        // Buffer reasoning tokens and emit a single consolidated event when
        // the thinking block ends. The adapter emits one STEP_FINISHED per
        // token, each carrying the full accumulated text in `content`. Passing
        // them through individually causes:
        //   1. O(n²) bytes over the wire (content grows each event)
        //   2. One ThinkingPart pushed to assistantParts per token, producing
        //      the progressive "token staircase" on reload when Chat.tsx
        //      concatenates consecutive thinking parts with \n\n
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
          })
        }
      } else if (chunk.type === 'CUSTOM' && chunk.name === 'spec_complete') {
        const spec = (chunk.value as { spec: unknown }).spec
        assistantParts.push({
          type: 'ui-spec' as 'text',
          content: JSON.stringify(spec),
        })
      }
      yield chunk
    }

    yield* flushThinking()
  } catch (err) {
    streamError = err
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

function extractUserMessage(messages: Array<any>): {
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

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest()
        const log = req.context.log as RequestLogger

        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          throw createError({
            message: 'Azure OpenAI environment variables not configured',
            status: 500,
            why: 'Missing one or more required environment variables',
            fix: 'Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT',
          })
        }

        const { messages, data } = chatRequestSchema.parse(await request.json())
        let threadId: string | undefined = data?.threadId
        let threadCreated = false

        const { content: userContent, parts: userParts } =
          extractUserMessage(messages)

        if (!threadId && userContent) {
          const title =
            userContent.length > 60
              ? userContent.slice(0, 60) + '...'
              : userContent
          threadId = await createThread(title)
          threadCreated = true
        }

        const conversationId: string | undefined =
          data?.conversationId || threadId

        log.set({
          conversationId,
          threadId,
          threadCreated,
          messageCount: messages?.length,
          model: data?.model,
        })

        const adapter = getAzureAdapter(data?.model)
        const mcpTools = await getMcpTools(
          data?.selectedServers,
          data?.enabledTools,
        )

        const modelName = data?.model || process.env.AZURE_OPENAI_DEPLOYMENT!
        const supportsReasoning = /gpt-5|o[1-9]/.test(modelName)

        const catalogSystemPrompt = uiCatalog.prompt({
          mode: 'inline',
          customRules: [
            'Generate exactly ONE visualization per response -- either a single chart or a single data grid.',
            'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
            'When using DataGrid, include ALL rows in a single DataGrid with pagination enabled. Never split data across multiple responses or render tabular data as text.',
            'If the user asks for multiple visualizations, generate the most relevant one and offer to show others in follow-up messages.',
            'Use the collect_form_data tool when you need structured input from the user (e.g. registration, configuration, multi-field queries). Do not ask for multiple pieces of information via plain text when a form would be clearer. After calling collect_form_data, end your turn immediately with no text — the user must fill and submit the form before you respond again.',
          ],
        })

        const rawStream = chat({
          adapter,
          messages,
          conversationId,
          ...(!supportsReasoning && { temperature: data?.temperature }),
          systemPrompts: [
            ...(data?.systemPrompt ? [data.systemPrompt] : []),
            catalogSystemPrompt,
          ],
          tools: [createPlanTool, collectFormDataTool, ...mcpTools],
          agentLoopStrategy: maxIterations(5),
          ...(supportsReasoning && {
            modelOptions: {
              reasoning: { effort: 'low', summary: 'auto' },
            },
          }),
        })

        const stream = withJsonRender(withFormStop(rawStream))

        log.set({ phase: 'stream_started' })

        if (threadId && userContent) {
          return toServerSentEventsResponse(
            withPersistence(stream, threadId, threadCreated, userContent, userParts, log),
          )
        }

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
