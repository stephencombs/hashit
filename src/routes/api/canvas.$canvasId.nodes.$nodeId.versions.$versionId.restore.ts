import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvasNodes, nodeVersions } from '~/db/schema'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const Route = createFileRoute(
  '/api/canvas/$canvasId/nodes/$nodeId/versions/$versionId/restore',
)({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { nodeId, versionId } = params
        const now = new Date()

        const version = await db
          .select()
          .from(nodeVersions)
          .where(eq(nodeVersions.id, versionId))
          .get()

        if (!version) {
          return Response.json(
            { error: 'Version not found' },
            { status: 404 },
          )
        }

        await db
          .update(canvasNodes)
          .set({ content: version.content, updatedAt: now })
          .where(eq(canvasNodes.id, nodeId))

        const latestVersion = await db
          .select({ versionNumber: nodeVersions.versionNumber })
          .from(nodeVersions)
          .where(eq(nodeVersions.nodeId, nodeId))
          .orderBy(desc(nodeVersions.versionNumber))
          .limit(1)

        const nextVersion =
          latestVersion.length > 0 ? latestVersion[0].versionNumber + 1 : 1

        const newVersion = {
          id: nanoid(),
          nodeId,
          versionNumber: nextVersion,
          content: version.content,
          source: 'user' as const,
          createdAt: now,
        }

        await db.insert(nodeVersions).values(newVersion)

        return Response.json(newVersion, { status: 201 })
      },
    },
  },
})
