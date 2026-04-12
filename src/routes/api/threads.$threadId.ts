import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { threads, messages } from '~/db/schema'
import { eq, asc } from 'drizzle-orm'

export const Route = createFileRoute('/api/threads/$threadId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { threadId } = params

        const thread = await db
          .select()
          .from(threads)
          .where(eq(threads.id, threadId))
          .get()

        if (!thread) {
          return Response.json({ error: 'Thread not found' }, { status: 404 })
        }

        const threadMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.threadId, threadId))
          .orderBy(asc(messages.createdAt))

        return Response.json({ ...thread, messages: threadMessages })
      },
    },
  },
})
