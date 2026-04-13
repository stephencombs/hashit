import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { nodeVersions } from '~/db/schema'
import { eq, desc } from 'drizzle-orm'

export const Route = createFileRoute(
  '/api/canvas/$canvasId/nodes/$nodeId/versions',
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { nodeId } = params

        const versions = await db
          .select()
          .from(nodeVersions)
          .where(eq(nodeVersions.nodeId, nodeId))
          .orderBy(desc(nodeVersions.versionNumber))

        return Response.json(versions)
      },
    },
  },
})
