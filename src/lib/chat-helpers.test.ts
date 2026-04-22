import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockUpdateSet = vi.fn(() => ({
    where: mockUpdateWhere,
  }))
  const mockUpdate = vi.fn(() => ({
    set: mockUpdateSet,
  }))
  const mockInsert = vi.fn(() => ({
    values: mockInsertValues,
  }))
  const mockTransaction = vi.fn(
    async (
      callback: (tx: {
        insert: typeof mockInsert
        update: typeof mockUpdate
      }) => Promise<void>,
    ) => callback({ insert: mockInsert, update: mockUpdate }),
  )

  return {
    mockInsert,
    mockInsertValues,
    mockTransaction,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
  }
})

vi.mock('@tanstack/ai', () => ({
  chat: vi.fn(),
  generateMessageId: () => 'assistant-message-1',
}))

vi.mock('~/db', () => ({
  db: {
    insert: mocks.mockInsert,
    transaction: mocks.mockTransaction,
    update: mocks.mockUpdate,
  },
}))

vi.mock('~/db/schema', () => ({
  messages: { id: 'messages.id' },
  threads: { id: 'threads.id' },
}))

vi.mock('~/lib/agent-runtime-utils', () => ({
  createRunMetadata: vi.fn(),
  summarizeToolActivity: vi.fn(async () => 'summary'),
}))

vi.mock('~/lib/openai-adapter', () => ({
  getAzureAdapter: vi.fn(),
}))

vi.mock('~/lib/telemetry/agent-spans', () => ({
  createChildSpan: vi.fn(),
  finalizeAgentRunTrace: vi.fn(),
  finishPersistenceSpan: vi.fn(),
  startPersistenceSpan: vi.fn(),
}))

vi.mock('~/lib/telemetry/otel', () => ({
  endTraceSpan: vi.fn(),
  markTraceError: vi.fn(),
  markTraceSuccess: vi.fn(),
}))

import { persistAssistantMessage } from '~/lib/chat-helpers'
import type { AppMessagePart } from '~/components/chat/message-row.types'

describe('persistAssistantMessage resume checkpoint persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes resumeOffset on thread update when checkpoint is provided', async () => {
    await (persistAssistantMessage as unknown as (...args: Array<unknown>) => Promise<string>)(
      'thread-1',
      'assistant response',
      [{ type: 'text', content: 'assistant response' }],
      undefined,
      'offset-456',
    )

    const threadUpdateCall = mocks.mockUpdateSet.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined
    expect(threadUpdateCall).toMatchObject({
      resumeOffset: 'offset-456',
    })
  })
})

describe('persistAssistantMessage — message part shapes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists ui-spec parts with a spec object, not a stringified content field', async () => {
    const specObject = { type: 'form', fields: [{ id: 'name', label: 'Name' }] }
    const parts: AppMessagePart[] = [
      { type: 'ui-spec', spec: specObject as never, specIndex: 0 },
    ]

    await persistAssistantMessage('thread-1', '', parts)

    const insertedValues = mocks.mockInsertValues.mock.calls[0]?.[0] as
      | { parts: AppMessagePart[] }
      | undefined

    const uiSpecPart = insertedValues?.parts?.find((p) => p.type === 'ui-spec') as
      | { type: 'ui-spec'; spec: unknown; content?: unknown }
      | undefined

    expect(uiSpecPart).toBeDefined()
    expect(uiSpecPart?.spec).toEqual(specObject)
    expect(uiSpecPart).not.toHaveProperty('content')
  })

  it('persists tool-call parts with an argsPreview field pre-computed from arguments', async () => {
    const parts: AppMessagePart[] = [
      {
        type: 'tool-call',
        id: 'tc-1',
        name: 'search',
        arguments: JSON.stringify({ query: 'hello world', limit: 5 }),
        argsPreview: 'hello world, 5',
        state: 'input-complete',
      },
    ]

    await persistAssistantMessage('thread-1', '', parts)

    const insertedValues = mocks.mockInsertValues.mock.calls[0]?.[0] as
      | { parts: AppMessagePart[] }
      | undefined

    const toolCallPart = insertedValues?.parts?.find((p) => p.type === 'tool-call') as
      | { type: 'tool-call'; argsPreview?: string }
      | undefined

    expect(toolCallPart?.argsPreview).toBe('hello world, 5')
  })
})
