import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { chatRequestSchema } from '~/lib/schemas'
import { createPlanTool } from '~/lib/tools'
import { collectFormDataTool } from '~/lib/form-tool'
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
import type { StreamChunk } from '@tanstack/ai'

/**
 * Stops the agent loop stream as soon as collect_form_data completes.
 * Without this, TanStack AI's agent loop sees a completed tool call and
 * runs the LLM again, causing it to call the form tool a second (or third)
 * time before the user has had a chance to fill the form.
 */
async function* withFormStop(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const formToolCallIds = new Set<string>()
  for await (const chunk of stream) {
    yield chunk
    if (chunk.type === 'TOOL_CALL_START' && chunk.toolName === 'collect_form_data') {
      formToolCallIds.add(chunk.toolCallId)
    }
    if (chunk.type === 'TOOL_CALL_END' && formToolCallIds.has(chunk.toolCallId)) {
      return
    }
  }
}

export const Route = createFileRoute('/api/chat')({
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

        const { messages, data } = chatRequestSchema.parse(await request.json())
        let threadId: string | undefined = data?.threadId
        let threadCreated = false

        const { content: userContent, parts: userParts } =
          extractUserMessage(messages)

        if (!threadId && userContent) {
          const title =
            userContent.length > 60
              ? userContent.slice(0, 60) + '...'
              : userContent
          threadId = await createThread(title, data?.source)
          threadCreated = true
        }

        const conversationId: string | undefined =
          data?.conversationId || threadId

        log.set({
          conversationId,
          threadId,
          threadCreated,
          messageCount: messages?.length,
          model: data?.model,
        })

        const adapter = getAzureAdapter(data?.model)
        const mcpTools = await getMcpTools(
          data?.selectedServers,
          data?.enabledTools,
        )

        const modelName = data?.model || process.env.AZURE_OPENAI_DEPLOYMENT!
        const supportsReasoning = /gpt-5|o[1-9]/.test(modelName)

        const catalogSystemPrompt = uiCatalog.prompt({
          mode: 'inline',
          customRules: [
            'You may generate multiple visualizations in a single response when the user requests it or when the data naturally calls for it (e.g. "show sales and headcount" → two charts). Each visualization must be a separate spec block.',
            'Use DataGrid for tabular results with many rows/columns. Use charts for trends, comparisons, and distributions.',
            'When using DataGrid, include ALL rows in a single DataGrid with pagination enabled. Never split data across multiple responses or render tabular data as text.',
            'Use the collect_form_data tool when you need structured input from the user (e.g. registration, configuration, multi-field queries). Do not ask for multiple pieces of information via plain text when a form would be clearer. After calling collect_form_data, end your turn immediately with no text — the user must fill and submit the form before you respond again.',
          ],
        })

        const rawStream = chat({
          adapter,
          messages,
          conversationId,
          ...(!supportsReasoning && { temperature: data?.temperature }),
          systemPrompts: [
            ...(data?.systemPrompt ? [data.systemPrompt] : []),
            catalogSystemPrompt,
          ],
          tools: [createPlanTool, collectFormDataTool, ...mcpTools],
          agentLoopStrategy: maxIterations(5),
          ...(supportsReasoning && {
            modelOptions: {
              reasoning: { effort: 'low', summary: 'auto' },
            },
          }),
        })

        const stream = withJsonRender(withFormStop(rawStream))

        log.set({ phase: 'stream_started' })

        if (threadId && userContent) {
          return toServerSentEventsResponse(
            withPersistence(stream, threadId, threadCreated, userContent, userParts, log),
          )
        }

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
