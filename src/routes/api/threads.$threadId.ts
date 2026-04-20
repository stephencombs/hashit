import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { threads, messages } from '~/db/schema'
import { eq, asc } from 'drizzle-orm'

export const Route = createFileRoute('/api/threads/$threadId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { threadId } = params

        const [[thread], threadMessages] = await Promise.all([
          db
            .select()
            .from(threads)
            .where(eq(threads.id, threadId))
            .limit(1),
          db
            .select()
            .from(messages)
            .where(eq(messages.threadId, threadId))
            .orderBy(asc(messages.createdAt)),
        ])

        if (!thread) {
          return Response.json({ error: 'Thread not found' }, { status: 404 })
        }

        return Response.json({ ...thread, messages: threadMessages })
      },

      PATCH: async ({ params, request }) => {
        const { threadId } = params
        const body = await request.json() as { pinned?: boolean; title?: string }
        const set: Record<string, unknown> = {}
        if (body.pinned !== undefined) {
          set.pinnedAt = body.pinned ? new Date() : null
        }
        if (body.title !== undefined) {
          set.title = body.title
          set.updatedAt = new Date()
        }
        await db
          .update(threads)
          .set(set)
          .where(eq(threads.id, threadId))
        return Response.json({ ok: true })
      },

      DELETE: async ({ params }) => {
        const { threadId } = params
        await db
          .update(threads)
          .set({ deletedAt: new Date() })
          .where(eq(threads.id, threadId))
        return new Response(null, { status: 204 })
      },
    },
  },
})
