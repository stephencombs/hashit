/**
 * UI-generation eval suite.
 *
 * Covers:
 *  1. Single-spec streaming chat path — patch coalescing, spec_complete delivery
 *  2. Multi-spec streaming chat path — correct specIndex sequencing
 *  3. Spec validation — shared validateWidgetSpec catches structural issues
 *  4. Patch coalescing — only latest patch emitted per drain cycle
 *  5. Invalid/empty-spec paths — graceful fallback
 *
 * Run with:
 *   npx tsx scripts/evals/ui-generation.ts
 */

import assert from 'node:assert/strict'
import { withJsonRender, type UiGenerationMetrics } from '../../src/lib/json-render-stream'
import { validateWidgetSpec } from '../../src/lib/ui-catalog'
import type { StreamChunk } from '@tanstack/ai'
import type { Spec } from '@json-render/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScenarioResult =
  | { id: string; status: 'passed'; detail?: string }
  | { id: string; status: 'skipped'; detail: string }
  | { id: string; status: 'failed'; detail: string }

async function runScenario(
  id: string,
  fn: () => Promise<void>,
): Promise<ScenarioResult> {
  try {
    await fn()
    return { id, status: 'passed' }
  } catch (err) {
    return {
      id,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Convert a string of SSE-style LLM output into a minimal StreamChunk sequence. */
async function* makeTextStream(
  text: string,
  chunkSize = 64,
): AsyncGenerator<StreamChunk> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: text.slice(i, i + chunkSize),
      timestamp: Date.now(),
    } as StreamChunk
  }
  yield { type: 'TEXT_MESSAGE_END', timestamp: Date.now() } as StreamChunk
}

async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

// JSONL patch format uses RFC 6902 (JSON Patch) with string JSON Pointer paths.
// ops: add | replace | remove. The spec compiler resolves /root and /elements/*
// paths against the spec object being compiled.

/** Minimal valid BarChart spec in JSONL patch format. */
const SINGLE_SPEC_JSONL = `
\`\`\`spec
{"op":"add","path":"/root","value":"chart1"}
{"op":"add","path":"/elements/chart1","value":{"type":"BarChart","children":[],"props":{"title":null,"data":[{"x":"A","y":1},{"x":"B","y":2}],"xKey":"x","yKeys":["y"],"horizontal":null,"stacked":null,"height":null}}}
\`\`\`
`.trim()

/** Two sequential spec blocks. */
const MULTI_SPEC_JSONL = `
\`\`\`spec
{"op":"add","path":"/root","value":"chart1"}
{"op":"add","path":"/elements/chart1","value":{"type":"BarChart","children":[],"props":{"title":null,"data":[{"x":"A","y":1}],"xKey":"x","yKeys":["y"],"horizontal":null,"stacked":null,"height":null}}}
\`\`\`

Some prose in between.

\`\`\`spec
{"op":"add","path":"/root","value":"chart2"}
{"op":"add","path":"/elements/chart2","value":{"type":"BarChart","children":[],"props":{"title":null,"data":[{"x":"B","y":2}],"xKey":"x","yKeys":["y"],"horizontal":null,"stacked":null,"height":null}}}
\`\`\`
`

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios: Promise<ScenarioResult>[] = [

  runScenario('single-spec-delivers-spec-complete', async () => {
    const chunks = await collectChunks(withJsonRender(makeTextStream(SINGLE_SPEC_JSONL)))
    const completes = chunks.filter((c) => c.type === 'CUSTOM' && (c as { name: string }).name === 'spec_complete')
    assert.equal(completes.length, 1, `Expected 1 spec_complete, got ${completes.length}`)
    const payload = (completes[0] as { value: { spec: Spec; specIndex: number } }).value
    assert.equal(payload.specIndex, 0, 'specIndex must be 0 for first spec')
    assert.ok(payload.spec.root, 'spec.root must be set')
    assert.ok(payload.spec.elements, 'spec.elements must be set')
  }),

  runScenario('multi-spec-delivers-correct-specIndex', async () => {
    const chunks = await collectChunks(withJsonRender(makeTextStream(MULTI_SPEC_JSONL)))
    const completes = chunks.filter((c) => c.type === 'CUSTOM' && (c as { name: string }).name === 'spec_complete')
    assert.equal(completes.length, 2, `Expected 2 spec_complete events, got ${completes.length}`)
    const idx0 = (completes[0] as { value: { specIndex: number } }).value.specIndex
    const idx1 = (completes[1] as { value: { specIndex: number } }).value.specIndex
    assert.equal(idx0, 0, 'First spec_complete must have specIndex 0')
    assert.equal(idx1, 1, 'Second spec_complete must have specIndex 1')
  }),

  runScenario('patch-coalescing-reduces-patch-events', async () => {
    // Stream the JSONL in very small chunks so multiple patch lines arrive per cycle.
    let metrics: UiGenerationMetrics | undefined
    const chunks = await collectChunks(
      withJsonRender(makeTextStream(SINGLE_SPEC_JSONL, 8), (m) => { metrics = m }),
    )
    const patches = chunks.filter((c) => c.type === 'CUSTOM' && (c as { name: string }).name === 'spec_patch')
    assert.ok(metrics, 'onMetrics callback must have been called')
    assert.ok(
      metrics!.patchesEmitted <= metrics!.patchLinesReceived,
      `patchesEmitted (${metrics!.patchesEmitted}) must be ≤ patchLinesReceived (${metrics!.patchLinesReceived})`,
    )
    assert.ok(
      patches.length <= metrics!.patchLinesReceived,
      `patch event count (${patches.length}) must be ≤ patch lines parsed (${metrics!.patchLinesReceived})`,
    )
  }),

  runScenario('metrics-callback-reports-specs-completed', async () => {
    let metrics: UiGenerationMetrics | undefined
    await collectChunks(withJsonRender(makeTextStream(MULTI_SPEC_JSONL), (m) => { metrics = m }))
    assert.ok(metrics, 'onMetrics callback must be called')
    assert.equal(metrics!.specsCompleted, 2, `Expected specsCompleted=2, got ${metrics!.specsCompleted}`)
    assert.ok(metrics!.totalMs >= 0, 'totalMs must be non-negative')
  }),

  runScenario('no-spec-in-prose-only-stream', async () => {
    const prose = 'Hello world. No spec here.\n\nJust regular markdown text.'
    let metrics: UiGenerationMetrics | undefined
    const chunks = await collectChunks(withJsonRender(makeTextStream(prose), (m) => { metrics = m }))
    const completes = chunks.filter((c) => c.type === 'CUSTOM' && (c as { name: string }).name === 'spec_complete')
    assert.equal(completes.length, 0, 'No spec_complete expected for prose-only stream')
    assert.ok(metrics, 'onMetrics must fire even with no specs')
    assert.equal(metrics!.specsCompleted, 0)
    assert.equal(metrics!.patchLinesReceived, 0)
  }),

  runScenario('validateWidgetSpec-accepts-valid-bar-chart', () => {
    const validSpec: Spec = {
      root: 'chart1',
      elements: {
        chart1: {
          type: 'BarChart',
          children: [],
          props: {
            title: null,
            data: [{ x: 'A', y: 1 }],
            xKey: 'x',
            yKeys: ['y'],
            horizontal: null,
            stacked: null,
            height: null,
          },
        },
      },
    }
    const result = validateWidgetSpec(validSpec)
    assert.ok(result.valid, `Expected valid, got: ${result.valid ? '' : result.reason}`)
    return Promise.resolve()
  }),

  runScenario('validateWidgetSpec-accepts-spec-without-children-normalized', () => {
    // Specs from the LLM stream often omit children; validateWidgetSpec normalizes them.
    const specWithoutChildren: Spec = {
      root: 'chart1',
      elements: {
        chart1: {
          type: 'BarChart',
          props: {
            title: null,
            data: [{ x: 'A', y: 1 }],
            xKey: 'x',
            yKeys: ['y'],
            horizontal: null,
            stacked: null,
            height: null,
          },
        },
      },
    }
    const result = validateWidgetSpec(specWithoutChildren)
    assert.ok(result.valid, `Expected valid after children normalization, got: ${result.valid ? '' : result.reason}`)
    return Promise.resolve()
  }),

  runScenario('validateWidgetSpec-rejects-empty-data', () => {
    const emptyDataSpec: Spec = {
      root: 'chart1',
      elements: {
        chart1: {
          type: 'BarChart',
          children: [],
          props: {
            title: null,
            data: [],
            xKey: 'x',
            yKeys: ['y'],
            horizontal: null,
            stacked: null,
            height: null,
          },
        },
      },
    }
    const result = validateWidgetSpec(emptyDataSpec)
    assert.ok(!result.valid, 'Expected invalid for empty data')
    assert.ok(
      !result.valid && result.reason.includes('empty data'),
      `Reason should mention empty data, got: ${!result.valid ? result.reason : ''}`,
    )
    return Promise.resolve()
  }),

  runScenario('validateWidgetSpec-rejects-empty-yKeys', () => {
    const emptySeriesSpec: Spec = {
      root: 'chart1',
      elements: {
        chart1: {
          type: 'BarChart',
          children: [],
          props: {
            title: null,
            data: [{ x: 'A', y: 1 }],
            xKey: 'x',
            yKeys: [],
            horizontal: null,
            stacked: null,
            height: null,
          },
        },
      },
    }
    const result = validateWidgetSpec(emptySeriesSpec)
    assert.ok(!result.valid, 'Expected invalid for empty yKeys')
    return Promise.resolve()
  }),

  runScenario('validateWidgetSpec-rejects-null-spec', () => {
    const result = validateWidgetSpec(null)
    assert.ok(!result.valid, 'Expected invalid for null spec')
    return Promise.resolve()
  }),

]

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  const results = await Promise.all(scenarios)

  const passed = results.filter((r) => r.status === 'passed')
  const failed = results.filter((r) => r.status === 'failed')
  const skipped = results.filter((r) => r.status === 'skipped')

  console.log('\n─── UI Generation Evals ────────────────────────')
  for (const r of results) {
    const icon = r.status === 'passed' ? '✓' : r.status === 'skipped' ? '⊘' : '✗'
    const detail = r.status !== 'passed' ? ` — ${r.detail}` : ''
    console.log(`  ${icon} ${r.id}${detail}`)
  }
  console.log(`\n  Passed: ${passed.length}  Failed: ${failed.length}  Skipped: ${skipped.length}`)
  console.log('────────────────────────────────────────────────\n')

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
