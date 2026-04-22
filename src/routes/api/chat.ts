import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import {
  toDurableChatSessionResponse,
  type DurableSessionMessage,
} from '@durable-streams/tanstack-ai-transport'
import { chatRequestSchema } from '~/lib/schemas'
import { withJsonRender } from '~/lib/json-render-stream'
import {
  extractUserMessage,
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
import {
  buildChatStreamPath,
  getDurableChatSessionTarget,
} from '~/lib/durable-streams'
import { beginThreadRun, endThreadRun } from '~/lib/server/thread-run-state'

async function* withThreadRunTracking(
  stream: AsyncIterable<StreamChunk>,
  threadId: string,
): AsyncIterable<StreamChunk> {
  try {
    for await (const chunk of stream) {
      yield chunk
    }
  } finally {
    endThreadRun(threadId)
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

function extractLatestUserMessage(
  messages: Array<{ role?: string; id?: string; content?: string; parts?: Array<unknown> }>,
): DurableSessionMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'user') {
      return message as DurableSessionMessage
    }
  }
  return undefined
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest()
        const log = req.context?.log as RequestLogger

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

        const url = new URL(request.url)
        const { messages, data } = chatRequestSchema.parse(await request.json())

        // Thread id comes from (in priority order): query string (durable
        // connection `sendUrl` convention), body.data.threadId (legacy).
        // Pre-create happens client-side via POST /api/threads so we can
        // require a stable id here and key the durable session stream on it.
        const threadId = url.searchParams.get('id') ?? data?.threadId
        if (!threadId) {
          throw createError({
            message: 'Missing thread id for durable chat session',
            status: 400,
            why: 'Request is missing an `id` query param and data.threadId — durable connections require a stable session id.',
            fix: 'Create a thread via POST /api/threads first, then pass its id as `?id=<threadId>` in the sendUrl.',
          })
        }

        beginThreadRun(threadId)
        try {
          const {
            id: userMessageId,
            content: userContent,
            parts: userParts,
          } = extractUserMessage(messages)
          const latestMessage = messages?.[messages.length - 1] as
            | { role?: string }
            | undefined
          const hasNewUserTurn = latestMessage?.role === 'user'
          const isContinuationTurn = !hasNewUserTurn

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

          const hasUserTurn = userContent.length > 0 || userParts.length > 0
          const shouldPersistUserTurn = hasNewUserTurn && hasUserTurn

          const streamPath = buildChatStreamPath(threadId)
          const streamTarget = getDurableChatSessionTarget(streamPath)

          // Continuation POSTs from a client tool resolution replay the full
          // message history with the assistant tool-call `output` now populated.
          // Reconcile those into Postgres so reloads and snapshots see the
          // submitted state. Skip this for fresh user turns.
          if (isContinuationTurn) {
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
              'agent.thread_created': false,
              'agent.message_count': messages?.length,
            },
          })

          log.set({
            conversationId,
            threadId,
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

          const renderedStream = withJsonRender(rawStream, (metrics) => {
            log.set({
              uiGenPatchLinesReceived: metrics.patchLinesReceived,
              uiGenPatchesEmitted: metrics.patchesEmitted,
              uiGenSpecsCompleted: metrics.specsCompleted,
              uiGenTotalMs: metrics.totalMs,
            })
          })

          log.set({ phase: 'stream_started' })

        // Only persist + echo a new user message when this POST represents a
        // fresh user turn. Tool-result continuations must pass `newMessages:
        // []` so the durable stream is not polluted with re-echoed prompts.
          const newUserMessage =
            shouldPersistUserTurn ? extractLatestUserMessage(messages) : undefined
          const newMessages: Array<DurableSessionMessage> = newUserMessage
            ? [newUserMessage]
            : []

          const responseStream: AsyncIterable<StreamChunk> = hasUserTurn
            ? withPersistence(
                renderedStream,
                threadId,
                /* threadCreated */ false,
                userContent,
                userParts,
                shouldPersistUserTurn,
                log,
                telemetry,
                userMessageId,
              )
            : withTraceFinalization(
                renderedStream,
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
              )
          const trackedResponseStream = withThreadRunTracking(
            responseStream,
            threadId,
          )

          return toDurableChatSessionResponse({
            stream: streamTarget,
            newMessages,
            responseStream: trackedResponseStream,
            // In Node/Container Apps we observed fire-and-forget writes being
            // dropped after returning 202, which leaves durable streams empty.
            // `await` keeps the request open until durable append completes.
            mode: 'await',
          })
        } catch (error) {
          endThreadRun(threadId)
          throw error
        }
      },
    },
  },
})
