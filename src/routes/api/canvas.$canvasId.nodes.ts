import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/db'
import { canvasNodes, nodeVersions } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createNodeBodySchema } from '~/lib/canvas-schemas'
import type { CanvasNodeType } from '~/db/schema'

const defaultLabels: Record<CanvasNodeType, string> = {
  prd: 'Product Requirements',
  user_stories: 'User Stories',
  uiux_spec: 'UI/UX Spec',
  tech_architecture: 'Tech Architecture',
  task_breakdown: 'Task Breakdown',
}

export const Route = createFileRoute('/api/canvas/$canvasId/nodes')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { canvasId } = params
        const nodes = await db
          .select()
          .from(canvasNodes)
          .where(eq(canvasNodes.canvasId, canvasId))
        return Response.json(nodes)
      },

      POST: async ({ params, request }) => {
        const { canvasId } = params
        const body = createNodeBodySchema.parse(await request.json())
        const now = new Date()

        const node = {
          id: nanoid(),
          canvasId,
          type: body.type,
          label: body.label || defaultLabels[body.type],
          content: null,
          positionX: body.positionX ?? 0,
          positionY: body.positionY ?? 0,
          status: 'idle' as const,
          createdAt: now,
          updatedAt: now,
        }

        await db.insert(canvasNodes).values(node)

        await db.insert(nodeVersions).values({
          id: nanoid(),
          nodeId: node.id,
          versionNumber: 0,
          content: null,
          source: 'user',
          createdAt: now,
        })

        return Response.json(node, { status: 201 })
      },
    },
  },
})
