import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'
import { createError } from 'evlog'
import { nanoid } from 'nanoid'
import { db } from '~/db'
import { canvasNodes, canvasEdges, nodeVersions } from '~/db/schema'
import { eq, desc } from 'drizzle-orm'
import { buildPromptMessages } from '~/lib/canvas-agents'
import type { CanvasNodeType } from '~/db/schema'
import type { StreamChunk } from '@tanstack/ai'

function getAzureAdapter(deployment?: string) {
  const model = deployment || process.env.AZURE_OPENAI_DEPLOYMENT!
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '')
  const baseURL = `${endpoint}/openai/v1`

  return createOpenaiChat(model as any, process.env.AZURE_OPENAI_API_KEY!, {
    baseURL,
  })
}

async function getUpstreamContents(canvasId: string, nodeId: string) {
  const edges = await db
    .select()
    .from(canvasEdges)
    .where(eq(canvasEdges.canvasId, canvasId))

  const incomingEdges = edges.filter((e) => e.targetNodeId === nodeId)
  const sourceNodeIds = incomingEdges.map((e) => e.sourceNodeId)

  if (sourceNodeIds.length === 0) return {}

  const sourceNodes = await Promise.all(
    sourceNodeIds.map(async (id) => {
      const [node] = await db
        .select()
        .from(canvasNodes)
        .where(eq(canvasNodes.id, id))
        .limit(1)
      return node
    }),
  )

  const upstream: Record<string, { type: CanvasNodeType; markdown: string }> = {}
  for (const node of sourceNodes) {
    if (!node?.content) continue
    const content = node.content as Record<string, unknown>
    const markdown =
      typeof content.markdown === 'string'
        ? content.markdown
        : JSON.stringify(content)
    upstream[node.id] = { type: node.type as CanvasNodeType, markdown }
  }

  return upstream
}

function getDownstreamNodeIds(
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
  nodeId: string,
): string[] {
  return edges
    .filter((e) => e.sourceNodeId === nodeId)
    .map((e) => e.targetNodeId)
}

async function* withNodePersistence(
  stream: AsyncIterable<StreamChunk>,
  canvasId: string,
  nodeId: string,
): AsyncIterable<StreamChunk> {
  await db
    .update(canvasNodes)
    .set({ status: 'generating', updatedAt: new Date() })
    .where(eq(canvasNodes.id, nodeId))

  yield {
    type: 'CUSTOM' as const,
    name: 'node_status',
    value: { nodeId, status: 'generating' },
    timestamp: Date.now(),
  }

  let accumulated = ''

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        if (chunk.content) {
          accumulated = chunk.content
        } else if (chunk.delta) {
          accumulated += chunk.delta
        }
      }
      yield chunk
    }

    const content = { markdown: accumulated }

    await db
      .update(canvasNodes)
      .set({ content, status: 'idle', updatedAt: new Date() })
      .where(eq(canvasNodes.id, nodeId))

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
      content,
      source: 'ai',
      createdAt: new Date(),
    })

    const edges = await db
      .select()
      .from(canvasEdges)
      .where(eq(canvasEdges.canvasId, canvasId))

    const downstreamIds = getDownstreamNodeIds(edges, nodeId)

    yield {
      type: 'CUSTOM' as const,
      name: 'generation_complete',
      value: { nodeId, downstreamNodeIds: downstreamIds },
      timestamp: Date.now(),
    }
  } catch {
    await db
      .update(canvasNodes)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(canvasNodes.id, nodeId))

    yield {
      type: 'CUSTOM' as const,
      name: 'node_status',
      value: { nodeId, status: 'error' },
      timestamp: Date.now(),
    }
  }
}

export const Route = createFileRoute(
  '/api/canvas/$canvasId/nodes/$nodeId/generate',
)({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { canvasId, nodeId } = params

        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          throw createError({
            message: 'Azure OpenAI environment variables not configured',
            status: 500,
            why: 'Missing one or more required environment variables',
            fix: 'Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT',
          })
        }

        const [node] = await db
          .select()
          .from(canvasNodes)
          .where(eq(canvasNodes.id, nodeId))
          .limit(1)

        if (!node) {
          return Response.json({ error: 'Node not found' }, { status: 404 })
        }

        const body = (await request.json().catch(() => ({}))) as {
          userInput?: string
        }

        const upstreamContents = await getUpstreamContents(canvasId, nodeId)
        const messages = buildPromptMessages(
          node.type as CanvasNodeType,
          body.userInput,
          upstreamContents,
        )

        const adapter = getAzureAdapter()

        const stream = chat({
          adapter,
          messages,
        })

        return toServerSentEventsResponse(
          withNodePersistence(stream, canvasId, nodeId),
        )
      },
    },
  },
})
