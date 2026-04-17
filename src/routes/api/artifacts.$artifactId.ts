import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { artifacts } from '~/db/schema'
import { eq } from 'drizzle-orm'

export const Route = createFileRoute('/api/artifacts/$artifactId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [artifact] = await db
          .select()
          .from(artifacts)
          .where(eq(artifacts.id, params.artifactId))
          .limit(1)

        if (!artifact) {
          return Response.json({ error: 'Artifact not found' }, { status: 404 })
        }

        return Response.json(artifact)
      },

      DELETE: async ({ params }) => {
        await db
          .delete(artifacts)
          .where(eq(artifacts.id, params.artifactId))

        return new Response(null, { status: 204 })
      },
    },
  },
})
