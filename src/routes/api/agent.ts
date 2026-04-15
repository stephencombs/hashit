import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { z } from 'zod'
import { uiCatalog } from '~/lib/ui-catalog'
import { withJsonRender } from '~/lib/json-render-stream'
import { getMcpTools } from '~/lib/mcp/client'
import {
  getAzureAdapter,
  createThread,
  extractUserMessage,
  withPersistence,
} from '~/lib/chat-helpers'
import type { RequestLogger } from 'evlog'

const agentRequestSchema = z.object({
  prompt: z.string().min(1),
  threadId: z.string().optional(),
})

export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest()
        const log = req.context.log as RequestLogger

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

        const { prompt, threadId: existingThreadId } = agentRequestSchema.parse(
          await request.json(),
        )

        let threadId = existingThreadId
        let threadCreated = false

        if (!threadId) {
          const title =
            prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt
          threadId = await createThread(title, 'automation')
          threadCreated = true
        }

        const messages = [{ role: 'user' as const, content: prompt }]
        const userParts = [{ type: 'text' as const, content: prompt }]

        log.set({
          threadId,
          threadCreated,
          source: 'automation',
        })

        const adapter = getAzureAdapter()
        const mcpTools = await getMcpTools()

        const catalogSystemPrompt = uiCatalog.prompt({
          mode: 'inline',
          customRules: [
            'You may generate multiple visualizations in a single response when the data naturally calls for it. Each visualization must be a separate spec block.',
            'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
            'When using DataGrid, include ALL rows in a single DataGrid with pagination enabled. Never split data across multiple responses or render tabular data as text.',
          ],
        })

        const rawStream = chat({
          adapter,
          messages,
          conversationId: threadId,
          systemPrompts: [catalogSystemPrompt],
          tools: mcpTools,
          agentLoopStrategy: maxIterations(5),
        })

        const stream = withJsonRender(rawStream)

        log.set({ phase: 'stream_started' })

        return toServerSentEventsResponse(
          withPersistence(stream, threadId, threadCreated, prompt, userParts, log),
        )
      },
    },
  },
})
