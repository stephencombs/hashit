import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvasNodes, nodeVersions, canvasEdges } from '~/db/schema'
import { eq, or, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { updateNodeBodySchema } from '~/lib/canvas-schemas'

export const Route = createFileRoute(
  '/api/canvas/$canvasId/nodes/$nodeId',
)({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        const { nodeId } = params
        const body = updateNodeBodySchema.parse(await request.json())
        const now = new Date()

        const set: Record<string, unknown> = { updatedAt: now }
        if (body.content !== undefined) set.content = body.content
        if (body.positionX !== undefined) set.positionX = body.positionX
        if (body.positionY !== undefined) set.positionY = body.positionY
        if (body.label !== undefined) set.label = body.label
        if (body.status !== undefined) set.status = body.status

        await db
          .update(canvasNodes)
          .set(set)
          .where(eq(canvasNodes.id, nodeId))

        if (body.content !== undefined) {
          const latestVersion = await db
            .select({ versionNumber: nodeVersions.versionNumber })
            .from(nodeVersions)
            .where(eq(nodeVersions.nodeId, nodeId))
            .orderBy(desc(nodeVersions.versionNumber))
            .limit(1)

          const nextVersion =
            latestVersion.length > 0 ? latestVersion[0].versionNumber + 1 : 1

          await db.insert(nodeVersions).values({
            id: nanoid(),
            nodeId,
            versionNumber: nextVersion,
            content: body.content ?? null,
            source: 'user',
            createdAt: now,
          })
        }

        return Response.json({ ok: true })
      },

      DELETE: async ({ params }) => {
        const { nodeId } = params

        await db
          .delete(canvasEdges)
          .where(
            or(
              eq(canvasEdges.sourceNodeId, nodeId),
              eq(canvasEdges.targetNodeId, nodeId),
            ),
          )

        await db
          .delete(nodeVersions)
          .where(eq(nodeVersions.nodeId, nodeId))

        await db.delete(canvasNodes).where(eq(canvasNodes.id, nodeId))

        return new Response(null, { status: 204 })
      },
    },
  },
})
