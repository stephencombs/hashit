import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvasEdges } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createEdgeBodySchema } from '~/lib/canvas-schemas'

export const Route = createFileRoute('/api/canvas/$canvasId/edges')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { canvasId } = params
        const body = createEdgeBodySchema.parse(await request.json())
        const now = new Date()

        const edge = {
          id: nanoid(),
          canvasId,
          sourceNodeId: body.sourceNodeId,
          targetNodeId: body.targetNodeId,
          createdAt: now,
        }

        await db.insert(canvasEdges).values(edge)

        return Response.json(edge, { status: 201 })
      },

      DELETE: async ({ request }) => {
        const { edgeId } = (await request.json()) as { edgeId: string }

        await db.delete(canvasEdges).where(eq(canvasEdges.id, edgeId))

        return new Response(null, { status: 204 })
      },
    },
  },
})
