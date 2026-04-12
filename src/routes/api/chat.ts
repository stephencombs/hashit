import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'

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
        if (
          !process.env.AZURE_OPENAI_API_KEY ||
          !process.env.AZURE_OPENAI_ENDPOINT ||
          !process.env.AZURE_OPENAI_DEPLOYMENT
        ) {
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

        try {
          const adapter = getAzureAdapter(data?.model)

          const stream = chat({
            adapter,
            messages,
            conversationId,
          })

          return toServerSentEventsResponse(stream)
        } catch (error) {
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
