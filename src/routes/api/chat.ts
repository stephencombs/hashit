import { toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import { chatRequestSchema } from '~/lib/schemas'
import { withJsonRender } from '~/lib/json-render-stream'
import {
  ATTACHMENT_ONLY_CONTENT_PREFIX,
  createThread,
  extractUserMessage,
  isPlaceholderUserContent,
  syncPriorToolOutputs,
  withPersistence,
} from '~/lib/chat-helpers'
import type { RequestLogger } from 'evlog'
import type { StreamChunk } from '@tanstack/ai'
import { createAgentRun } from '~/lib/agent-runner'
import {
  isVisionCapableModel,
  userMessagesContainMedia,
} from '~/lib/multimodal-parts'
import { finalizeAgentRunTrace, startAgentRunTrace } from '~/lib/telemetry/agent-spans'

// Interactive tools (collect_form_data, resolve_duplicate_entity) are now
// client-side `.client()` tools registered on the client via `useChat({ tools })`.
// TanStack AI's runtime owns pausing the agent loop on the client handler's
// await and resuming via checkForContinuation once the user responds, so this
// route no longer needs a custom stream-stop wrapper.

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

        const {
          id: userMessageId,
          content: userContent,
          parts: userParts,
        } = extractUserMessage(messages)

        // Hard server-side capability guard: never let multimodal content
        // reach a non-vision model. Client also guards, this is defense in
        // depth so misconfigured clients fail fast instead of silently
        // dropping the image context for the run.
        const requestedModel =
          data?.model?.trim() || process.env.AZURE_OPENAI_DEPLOYMENT
        if (
          userMessagesContainMedia(messages) &&
          !isVisionCapableModel(requestedModel)
        ) {
          throw createError({
            message: 'Model does not support image or document input',
            status: 415,
            why: `Selected model "${requestedModel ?? 'unknown'}" cannot process image, audio, video, or document parts`,
            fix: 'Select a vision-capable deployment (e.g. gpt-4o, gpt-4.1, gpt-5)',
          })
        }

        // Treat any non-empty user turn (text OR attachments) as valid for
        // thread creation and persistence so attachment-only sends work.
        const hasUserTurn = userContent.length > 0 || userParts.length > 0

        if (!threadId && hasUserTurn) {
          const fallbackTitle = isPlaceholderUserContent(userContent)
            ? userContent.replace(ATTACHMENT_ONLY_CONTENT_PREFIX, 'Attachment').trim()
            : userContent.length > 60
              ? userContent.slice(0, 60) + '...'
              : userContent || 'New Chat'
          threadId = await createThread(fallbackTitle, data?.source)
          threadCreated = true
        }

        // Client tool resolutions (e.g. collect_form_data, resolve_duplicate_entity)
        // arrive here as continuation POSTs where prior assistant messages
        // carry their tool-call `output` + a fresh tool-result part. Sync
        // those back into the existing DB rows so reloads see the submitted
        // state. No-op when there's nothing to upgrade.
        if (threadId && !threadCreated) {
          try {
            await syncPriorToolOutputs(
              threadId,
              (messages ?? []) as Parameters<typeof syncPriorToolOutputs>[1],
            )
          } catch (err) {
            log.set({ syncPriorToolOutputsError: String(err) })
          }
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

        const stream = withJsonRender(rawStream, (metrics) => {
          log.set({
            uiGenPatchLinesReceived: metrics.patchLinesReceived,
            uiGenPatchesEmitted: metrics.patchesEmitted,
            uiGenSpecsCompleted: metrics.specsCompleted,
            uiGenTotalMs: metrics.totalMs,
          })
        })

        log.set({ phase: 'stream_started' })

        if (threadId && hasUserTurn) {
          return toServerSentEventsResponse(
            withPersistence(
              stream,
              threadId,
              threadCreated,
              userContent,
              userParts,
              log,
              telemetry,
              userMessageId,
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
