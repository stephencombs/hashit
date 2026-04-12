import { chat, generateMessageId, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { nanoid } from 'nanoid'
import { db } from '~/db'
import { threads, messages as messagesTable } from '~/db/schema'
import { eq, desc, count } from 'drizzle-orm'
import { chatRequestSchema } from '~/lib/schemas'
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
  await db.insert(messagesTable).values({
    id,
    threadId,
    role: 'user',
    content: userContent,
    parts: userParts,
    createdAt: new Date(),
  })
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
  const assistantParts: Array<MessagePart> = []

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      if (chunk.content) {
        accumulated = chunk.content
      } else if (chunk.delta) {
        accumulated += chunk.delta
      }
    }
    yield chunk
  }

  if (accumulated) {
    assistantParts.push({ type: 'text', content: accumulated })

    try {
      await persistAssistantMessage(threadId, accumulated, assistantParts)
      maybeGenerateTitle(threadId, userContent).catch(() => {})
    } catch (err) {
      log.set({ persistAssistantError: String(err) })
    }
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

        const stream = chat({
          adapter,
          messages,
          conversationId,
        })

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
