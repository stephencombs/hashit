import {
  createMixedStreamParser,
  createSpecStreamCompiler,
} from '@json-render/core'
import type { Spec } from '@json-render/core'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Async generator that intercepts TEXT_MESSAGE_CONTENT chunks from a TanStack AI
 * chat stream, separates prose from json-render JSONL patches, compiles patches
 * into a progressive Spec, and emits the spec as CUSTOM events.
 *
 * Non-text chunks (TOOL_CALL_*, RUN_*, etc.) pass through unchanged.
 */
export async function* withJsonRender(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const compiler = createSpecStreamCompiler<Spec>()
  let hasSpec = false
  let flushed = false
  const textQueue: string[] = []
  const patchQueue: Spec[] = []

  const parser = createMixedStreamParser({
    onText: (text) => textQueue.push(text),
    onPatch: (patch) => {
      hasSpec = true
      compiler.push(JSON.stringify(patch) + '\n')
      patchQueue.push({ ...compiler.getResult() } as Spec)
    },
  })

  function* drainTextQueue(templateChunk?: StreamChunk) {
    while (textQueue.length > 0) {
      const text = textQueue.shift()!
      if (templateChunk) {
        yield { ...templateChunk, delta: text, content: undefined }
      } else {
        yield {
          type: 'TEXT_MESSAGE_CONTENT' as const,
          delta: text,
          timestamp: Date.now(),
        } as StreamChunk
      }
    }
  }

  function* drainPatchQueue() {
    while (patchQueue.length > 0) {
      const spec = patchQueue.shift()!
      yield {
        type: 'CUSTOM' as const,
        name: 'spec_patch',
        value: { spec },
        timestamp: Date.now(),
      }
    }
  }

  function* emitSpecComplete() {
    if (hasSpec) {
      hasSpec = false
      yield {
        type: 'CUSTOM' as const,
        name: 'spec_complete',
        value: { spec: compiler.getResult() },
        timestamp: Date.now(),
      }
    }
  }

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      parser.push(chunk.delta)
      yield* drainTextQueue(chunk)
      yield* drainPatchQueue()
      continue
    }

    // Flush buffered content before the message boundary so all text
    // and spec events arrive in correct protocol order
    if (chunk.type === 'TEXT_MESSAGE_END' && !flushed) {
      flushed = true
      parser.flush()
      yield* drainTextQueue()
      yield* drainPatchQueue()
      yield* emitSpecComplete()
    }

    yield chunk
  }

  // Fallback flush for streams that lack TEXT_MESSAGE_END
  if (!flushed) {
    parser.flush()
    yield* drainTextQueue()
    yield* drainPatchQueue()
    yield* emitSpecComplete()
  }
}
