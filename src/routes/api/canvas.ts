import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvases } from '~/db/schema'
import { desc, isNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createCanvasBodySchema } from '~/lib/canvas-schemas'

export const Route = createFileRoute('/api/canvas')({
  server: {
    handlers: {
      GET: async () => {
        const allCanvases = await db
          .select()
          .from(canvases)
          .where(isNull(canvases.deletedAt))
          .orderBy(
            sql`CASE WHEN ${canvases.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
            desc(canvases.updatedAt),
          )

        return Response.json(allCanvases)
      },

      POST: async ({ request }) => {
        const { title, description } = createCanvasBodySchema.parse(
          await request.json(),
        )
        const now = new Date()

        const canvas = {
          id: nanoid(),
          title: title || 'New Canvas',
          description: description || null,
          createdAt: now,
          updatedAt: now,
        }

        await db.insert(canvases).values(canvas)

        return Response.json(canvas, { status: 201 })
      },
    },
  },
})
