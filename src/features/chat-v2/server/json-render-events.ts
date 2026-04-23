import {
  createSpecStreamCompiler,
  parseSpecStreamLine,
  type Spec,
} from "@json-render/core";
import type { StreamChunk } from "@tanstack/ai";

export interface V2UiGenerationMetrics {
  patchLinesReceived: number;
  patchesEmitted: number;
  specsCompleted: number;
  totalMs: number;
}

export async function* withV2JsonRenderEvents(
  stream: AsyncIterable<StreamChunk>,
  onMetrics?: (metrics: V2UiGenerationMetrics) => void,
): AsyncIterable<StreamChunk> {
  let compiler = createSpecStreamCompiler<Spec>();
  let hasSpec = false;
  let specIndex = 0;
  let flushed = false;
  let buffer = "";
  let inSpecFence = false;
  const textQueue: string[] = [];
  const patchQueue: Array<{ spec: Spec; specIndex: number }> = [];
  const completeQueue: Array<{ spec: Spec; specIndex: number }> = [];

  let patchLinesReceived = 0;
  let patchesEmitted = 0;
  let specsCompleted = 0;
  let firstPatchAt = 0;

  function enqueueProse(fragment: string): void {
    if (hasSpec) {
      completeQueue.push({ spec: compiler.getResult(), specIndex });
      hasSpec = false;
      specIndex += 1;
      compiler = createSpecStreamCompiler<Spec>();
    }
    textQueue.push(fragment);
  }

  function enqueuePatch(line: string): void {
    const patch = parseSpecStreamLine(line);
    if (!patch) return;
    hasSpec = true;
    patchLinesReceived += 1;
    if (firstPatchAt === 0) firstPatchAt = Date.now();
    compiler.push(JSON.stringify(patch) + "\n");
    patchQueue.push({ spec: { ...compiler.getResult() } as Spec, specIndex });
  }

  function processLine(line: string): void {
    const trimmed = line.trim();
    if (!inSpecFence && trimmed.startsWith("```spec")) {
      inSpecFence = true;
      return;
    }
    if (inSpecFence && trimmed === "```") {
      inSpecFence = false;
      return;
    }
    if (!trimmed) {
      if (!inSpecFence) enqueueProse("\n");
      return;
    }
    if (inSpecFence) {
      enqueuePatch(trimmed);
      return;
    }
    const possiblePatch = parseSpecStreamLine(trimmed);
    if (possiblePatch) {
      enqueuePatch(trimmed);
    } else {
      enqueueProse(line + "\n");
    }
  }

  function pushTextChunk(chunk: string): void {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      processLine(line);
    }
  }

  function flushParser(): void {
    if (buffer.trim()) processLine(buffer);
    buffer = "";
  }

  function* drainTextQueue(templateChunk?: StreamChunk): Generator<StreamChunk> {
    while (textQueue.length > 0) {
      const text = textQueue.shift();
      if (!text) continue;
      if (templateChunk) {
        yield { ...templateChunk, delta: text, content: undefined };
        continue;
      }
      yield {
        type: "TEXT_MESSAGE_CONTENT",
        delta: text,
        timestamp: Date.now(),
      } as StreamChunk;
    }
  }

  function* drainCompleteQueue(): Generator<StreamChunk> {
    while (completeQueue.length > 0) {
      const entry = completeQueue.shift();
      if (!entry) continue;
      specsCompleted += 1;
      yield {
        type: "CUSTOM",
        name: "spec_complete",
        value: { spec: entry.spec, specIndex: entry.specIndex },
        timestamp: Date.now(),
      } as StreamChunk;
    }
  }

  function* drainPatchQueue(): Generator<StreamChunk> {
    if (patchQueue.length === 0) return;
    const latest = patchQueue[patchQueue.length - 1];
    patchQueue.length = 0;
    if (!latest) return;
    patchesEmitted += 1;
    yield {
      type: "CUSTOM",
      name: "spec_patch",
      value: { spec: latest.spec, specIndex: latest.specIndex },
      timestamp: Date.now(),
    } as StreamChunk;
  }

  function* emitFinalSpecComplete(): Generator<StreamChunk> {
    if (!hasSpec) return;
    hasSpec = false;
    specsCompleted += 1;
    yield {
      type: "CUSTOM",
      name: "spec_complete",
      value: { spec: compiler.getResult(), specIndex },
      timestamp: Date.now(),
    } as StreamChunk;
    specIndex += 1;
    compiler = createSpecStreamCompiler<Spec>();
  }

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      pushTextChunk(chunk.delta);
      yield* drainCompleteQueue();
      yield* drainTextQueue(chunk);
      yield* drainPatchQueue();
      continue;
    }

    if (chunk.type === "TEXT_MESSAGE_END" && !flushed) {
      flushed = true;
      flushParser();
      yield* drainCompleteQueue();
      yield* drainTextQueue();
      yield* drainPatchQueue();
      yield* emitFinalSpecComplete();
    }

    yield chunk;
  }

  if (!flushed) {
    flushParser();
    yield* drainCompleteQueue();
    yield* drainTextQueue();
    yield* drainPatchQueue();
    yield* emitFinalSpecComplete();
  }

  onMetrics?.({
    patchLinesReceived,
    patchesEmitted,
    specsCompleted,
    totalMs: firstPatchAt > 0 ? Date.now() - firstPatchAt : 0,
  });
}
