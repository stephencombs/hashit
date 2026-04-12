import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'
import { logger } from '~/utils/logger'
import { metrics } from '~/utils/metrics'
import { reportError } from '~/utils/error-reporter'

function getAzureAdapter(deployment?: string) {
  const model = deployment || process.env.AZURE_OPENAI_DEPLOYMENT!
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, '')
  const baseURL = `${endpoint}/openai/v1`

  return createOpenaiChat(model as any, process.env.AZURE_OPENAI_API_KEY!, {
    baseURL,
  })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const start = Date.now()

        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
          const err = new Error('Azure OpenAI environment variables not configured')
          reportError(err, { route: '/api/chat' })

          return new Response(
            JSON.stringify({
              error:
                'Azure OpenAI environment variables not configured. ' +
                'Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, ' +
                'and AZURE_OPENAI_DEPLOYMENT.',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const body = await request.json()
        const { messages, data } = body
        const conversationId: string | undefined = data?.conversationId

        logger.info('Chat request received', {
          conversationId,
          messageCount: messages?.length,
          model: data?.model,
        })

        try {
          const adapter = getAzureAdapter(data?.model)

          const stream = chat({
            adapter,
            messages,
            conversationId,
          })

          const duration = Date.now() - start
          metrics.record('api:chat:stream_start', duration)
          logger.info('Chat stream started', { conversationId, duration })

          return toServerSentEventsResponse(stream)
        } catch (error) {
          const duration = Date.now() - start
          metrics.record('api:chat:error', duration)
          reportError(error, { route: '/api/chat', conversationId })

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
