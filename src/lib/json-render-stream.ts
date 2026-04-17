import {
  createSpecStreamCompiler,
  parseSpecStreamLine,
} from '@json-render/core'
import type { Spec } from '@json-render/core'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Async generator that intercepts TEXT_MESSAGE_CONTENT chunks from a TanStack AI
 * chat stream, separates prose from json-render JSONL patches, compiles patches
 * into a progressive Spec, and emits the spec as CUSTOM events.
 *
 * Non-text chunks (TOOL_CALL_*, RUN_*, etc.) pass through unchanged.
 *
 * Prose outside ```spec fences is passed through **verbatim** (preserving `\n`),
 * including blank lines — so markdown lists stay tight and paragraph breaks stay
 * intact. (The stock createMixedStreamParser drops empty lines and the old fix of
 * appending `\n\n` after every non-empty line turned `- a\n- b` into loose lists
 * and confused Streamdown.)
 */
export async function* withJsonRender(
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  let compiler = createSpecStreamCompiler<Spec>()
  let hasSpec = false
  let flushed = false
  let specIndex = 0
  const textQueue: string[] = []
  const patchQueue: Array<{ spec: Spec; specIndex: number }> = []
  const completeQueue: Array<{ spec: Spec; specIndex: number }> = []

  let parseBuffer = ''
  let inSpecFence = false

  function enqueueProse(fragment: string) {
    if (hasSpec) {
      completeQueue.push({ spec: compiler.getResult(), specIndex })
      hasSpec = false
      specIndex++
      compiler = createSpecStreamCompiler<Spec>()
    }
    textQueue.push(fragment)
  }

  function enqueuePatch(patch: ReturnType<typeof parseSpecStreamLine>) {
    if (!patch) return
    hasSpec = true
    compiler.push(JSON.stringify(patch) + '\n')
    patchQueue.push({ spec: { ...compiler.getResult() } as Spec, specIndex })
  }

  function processLine(line: string) {
    const trimmed = line.trim()
    if (!inSpecFence && trimmed.startsWith('```spec')) {
      inSpecFence = true
      return
    }
    if (inSpecFence && trimmed === '```') {
      inSpecFence = false
      return
    }
    if (!trimmed) {
      if (!inSpecFence) {
        enqueueProse('\n')
      }
      return
    }
    if (inSpecFence) {
      const patch = parseSpecStreamLine(trimmed)
      if (patch) enqueuePatch(patch)
      return
    }
    const patch = parseSpecStreamLine(trimmed)
    if (patch) {
      enqueuePatch(patch)
    } else {
      enqueueProse(line + '\n')
    }
  }

  function pushChunk(chunk: string) {
    parseBuffer += chunk
    const lines = parseBuffer.split('\n')
    parseBuffer = lines.pop() ?? ''
    for (const line of lines) {
      processLine(line)
    }
  }

  function flushParser() {
    if (parseBuffer.trim()) {
      processLine(parseBuffer)
    }
    parseBuffer = ''
  }

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

  function* drainCompleteQueue() {
    while (completeQueue.length > 0) {
      const entry = completeQueue.shift()!
      yield {
        type: 'CUSTOM' as const,
        name: 'spec_complete',
        value: { spec: entry.spec, specIndex: entry.specIndex },
        timestamp: Date.now(),
      }
    }
  }

  function* drainPatchQueue() {
    while (patchQueue.length > 0) {
      const entry = patchQueue.shift()!
      yield {
        type: 'CUSTOM' as const,
        name: 'spec_patch',
        value: { spec: entry.spec, specIndex: entry.specIndex },
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
        value: { spec: compiler.getResult(), specIndex },
        timestamp: Date.now(),
      }
      specIndex++
      compiler = createSpecStreamCompiler<Spec>()
    }
  }

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      pushChunk(chunk.delta)
      yield* drainCompleteQueue()
      yield* drainTextQueue(chunk)
      yield* drainPatchQueue()
      continue
    }

    if (chunk.type === 'TEXT_MESSAGE_END' && !flushed) {
      flushed = true
      flushParser()
      yield* drainCompleteQueue()
      yield* drainTextQueue()
      yield* drainPatchQueue()
      yield* emitSpecComplete()
    }

    yield chunk
  }

  if (!flushed) {
    flushParser()
    yield* drainCompleteQueue()
    yield* drainTextQueue()
    yield* drainPatchQueue()
    yield* emitSpecComplete()
  }
}
