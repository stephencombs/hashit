import { toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { chatRequestSchema } from '~/lib/schemas'
import { createPlanTool } from '~/lib/tools'
import { collectFormDataTool } from '~/lib/form-tool'
import { uiCatalog } from '~/lib/ui-catalog'
import { withJsonRender } from '~/lib/json-render-stream'
import {
  createThread,
  extractUserMessage,
  withPersistence,
} from '~/lib/chat-helpers'
import type { RequestLogger } from 'evlog'
import type { StreamChunk } from '@tanstack/ai'
import { createAgentRun } from '~/lib/agent-runner'
import { finalizeAgentRunTrace, startAgentRunTrace } from '~/lib/telemetry/agent-spans'

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

async function* withTraceFinalization(
  stream: AsyncIterable<StreamChunk>,
  traceState: ReturnType<typeof startAgentRunTrace>,
  getFinalAttributes: () => Record<string, unknown>,
  getFinalError: () => string | undefined,
): AsyncIterable<StreamChunk> {
  try {
    for await (const chunk of stream) {
      yield chunk
    }
  } finally {
    finalizeAgentRunTrace(traceState, {
      error: getFinalError(),
      attributes: getFinalAttributes(),
    })
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
        const traceState = startAgentRunTrace({
          profile: 'interactiveChat',
          source: 'interactive-chat',
          conversationId,
          log,
          attributes: {
            'http.route': '/api/chat',
            'agent.thread_id': threadId,
            'agent.thread_created': threadCreated,
            'agent.message_count': messages?.length,
          },
        })

        log.set({
          conversationId,
          threadId,
          threadCreated,
          messageCount: messages?.length,
          model: data?.model,
          traceId: traceState.traceId,
          spanId: traceState.spanId,
        })

        const { stream: rawStream, telemetry } = await createAgentRun({
          profile: 'interactiveChat',
          source: 'interactive-chat',
          messages,
          conversationId,
          model: data?.model,
          temperature: data?.temperature,
          customSystemPrompt: data?.systemPrompt,
          selectedServers: data?.selectedServers,
          enabledTools: data?.enabledTools,
          log,
          traceState,
        })

        const stream = withJsonRender(withFormStop(rawStream))

        log.set({ phase: 'stream_started' })

        if (threadId && userContent) {
          return toServerSentEventsResponse(
            withPersistence(
              stream,
              threadId,
              threadCreated,
              userContent,
              userParts,
              log,
              telemetry,
            ),
          )
        }

        return toServerSentEventsResponse(
          withTraceFinalization(
            stream,
            traceState,
            () => ({
              'agent.status': telemetry.status,
              'agent.thread_id': threadId,
              'agent.tool_call_count': telemetry.toolCallCount,
              'agent.iteration_count': telemetry.iterationCount,
            }),
            () =>
              telemetry.status === 'failed' || telemetry.status === 'aborted'
                ? telemetry.error
                : undefined,
          ),
        )
      },
    },
  },
})
