import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { artifacts } from '~/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const Route = createFileRoute('/api/artifacts')({
  server: {
    handlers: {
      GET: async () => {
        const all = await db
          .select()
          .from(artifacts)
          .orderBy(desc(artifacts.createdAt))

        return Response.json(all)
      },

      POST: async ({ request }) => {
        const body = (await request.json()) as {
          title: string
          spec: Record<string, unknown>
          threadId?: string
          messageId?: string
        }

        const artifact = {
          id: nanoid(),
          title: body.title,
          spec: body.spec,
          threadId: body.threadId ?? null,
          messageId: body.messageId ?? null,
          createdAt: new Date(),
        }

        await db.insert(artifacts).values(artifact)

        return Response.json(artifact, { status: 201 })
      },
    },
  },
})
