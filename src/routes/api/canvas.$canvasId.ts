import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvases, canvasNodes, canvasEdges } from '~/db/schema'
import { eq } from 'drizzle-orm'

export const Route = createFileRoute('/api/canvas/$canvasId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { canvasId } = params

        const canvas = await db
          .select()
          .from(canvases)
          .where(eq(canvases.id, canvasId))
          .get()

        if (!canvas) {
          return Response.json({ error: 'Canvas not found' }, { status: 404 })
        }

        const nodes = await db
          .select()
          .from(canvasNodes)
          .where(eq(canvasNodes.canvasId, canvasId))

        const edges = await db
          .select()
          .from(canvasEdges)
          .where(eq(canvasEdges.canvasId, canvasId))

        return Response.json({ ...canvas, nodes, edges })
      },

      PATCH: async ({ params, request }) => {
        const { canvasId } = params
        const body = (await request.json()) as {
          title?: string
          description?: string
          pinned?: boolean
        }
        const set: Record<string, unknown> = { updatedAt: new Date() }
        if (body.title !== undefined) set.title = body.title
        if (body.description !== undefined) set.description = body.description
        if (body.pinned !== undefined) {
          set.pinnedAt = body.pinned ? new Date() : null
        }

        await db.update(canvases).set(set).where(eq(canvases.id, canvasId))
        return Response.json({ ok: true })
      },

      DELETE: async ({ params }) => {
        const { canvasId } = params
        await db
          .update(canvases)
          .set({ deletedAt: new Date() })
          .where(eq(canvases.id, canvasId))
        return new Response(null, { status: 204 })
      },
    },
  },
})
