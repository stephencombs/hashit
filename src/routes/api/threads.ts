import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { threads } from '~/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createThreadBodySchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/threads')({
  server: {
    handlers: {
      GET: async () => {
        const allThreads = await db
          .select()
          .from(threads)
          .orderBy(desc(threads.updatedAt))

        return Response.json(allThreads)
      },

      POST: async ({ request }) => {
        const { title } = createThreadBodySchema.parse(await request.json())
        const now = new Date()

        const thread = {
          id: nanoid(),
          title: title || 'New Chat',
          createdAt: now,
          updatedAt: now,
        }

        await db.insert(threads).values(thread)

        return Response.json(thread, { status: 201 })
      },
    },
  },
})
