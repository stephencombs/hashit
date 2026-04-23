import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockMaterializeSnapshotFromDurableStream = vi.fn();
  const mockBuildReadStreamUrl = vi.fn(
    (path: string) => `http://durable.local/${path}`,
  );
  const mockGetDurableReadHeaders = vi.fn(() => ({
    Authorization: "Bearer test",
  }));
  const mockReadDurableStreamHeadOffset = vi.fn(async () => undefined);
  const mockSelect = vi.fn();
  const mockInsertOnConflictDoNothing = vi.fn(async () => undefined);
  const mockInsertValues = vi.fn(() => ({
    onConflictDoNothing: mockInsertOnConflictDoNothing,
  }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockUpdateWhere = vi.fn(async () => undefined);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockLogSet = vi.fn();

  return {
    mockBuildReadStreamUrl,
    mockGetDurableReadHeaders,
    mockInsert,
    mockInsertOnConflictDoNothing,
    mockInsertValues,
    mockLogSet,
    mockMaterializeSnapshotFromDurableStream,
    mockReadDurableStreamHeadOffset,
    mockSelect,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
  };
});

vi.mock("@durable-streams/tanstack-ai-transport", () => ({
  materializeSnapshotFromDurableStream:
    mocks.mockMaterializeSnapshotFromDurableStream,
}));

vi.mock("~/lib/durable-streams", () => ({
  buildReadStreamUrl: mocks.mockBuildReadStreamUrl,
  getDurableReadHeaders: mocks.mockGetDurableReadHeaders,
  readDurableStreamHeadOffset: mocks.mockReadDurableStreamHeadOffset,
}));

vi.mock("~/db", () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

vi.mock("~/db/schema", () => ({
  v2Messages: {
    id: "id",
    threadId: "thread_id",
  },
  v2Threads: {
    id: "id",
    title: "title",
    resumeOffset: "resume_offset",
  },
}));

import { projectV2StreamSnapshotToDb } from "./stream-projection";

function createTelemetry() {
  return {
    profile: "interactiveChatV2",
    source: "interactive-chat-v2",
    status: "completed",
    requestMessageCount: 1,
    iterationCount: 1,
    toolCallCount: 0,
    toolCalls: [],
    startedAt: 1000,
    completedAt: 1020,
    durationMs: 20,
    finishReason: "stop",
    traceId: "trace-id",
  } as const;
}

function mockSelectResults(params: {
  thread: { resumeOffset: string | null } | null;
  existingRows: Array<{ id: string }>;
}) {
  const threadSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => (params.thread ? [params.thread] : [])),
  };
  const existingRowsSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(async () => params.existingRows),
  };
  mocks.mockSelect
    .mockImplementationOnce(() => threadSelect)
    .mockImplementationOnce(() => existingRowsSelect);
}

describe("projectV2StreamSnapshotToDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is idempotent when stream snapshot is already projected", async () => {
    mocks.mockMaterializeSnapshotFromDurableStream.mockResolvedValueOnce({
      messages: [
        {
          id: "u-1",
          role: "user",
          content: "Hello",
          parts: [{ type: "text", content: "Hello" }],
        },
        {
          id: "a-1",
          role: "assistant",
          content: "Hi",
          parts: [{ type: "text", content: "Hi" }],
        },
      ],
      offset: undefined,
    });
    mockSelectResults({
      thread: { resumeOffset: "off-1" },
      existingRows: [{ id: "u-1" }, { id: "a-1" }],
    });

    const result = await projectV2StreamSnapshotToDb({
      threadId: "thread-1",
      telemetry: createTelemetry(),
      persistUserTurn: true,
      userMessageId: "u-1",
      log: { set: mocks.mockLogSet } as never,
    });

    expect(result.persistedMessageCount).toBe(0);
    expect(mocks.mockInsert).not.toHaveBeenCalled();
    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("inserts new snapshot messages and updates thread resume offset", async () => {
    mocks.mockMaterializeSnapshotFromDurableStream.mockResolvedValueOnce({
      messages: [
        {
          id: "u-2",
          role: "user",
          content: "Plan a quarterly roadmap",
          parts: [{ type: "text", content: "Plan a quarterly roadmap" }],
        },
        {
          id: "a-2",
          role: "assistant",
          content: "Here is a draft roadmap.",
          parts: [{ type: "text", content: "Here is a draft roadmap." }],
        },
      ],
      offset: "off-2",
    });
    mockSelectResults({
      thread: { resumeOffset: null },
      existingRows: [],
    });

    const result = await projectV2StreamSnapshotToDb({
      threadId: "thread-2",
      telemetry: createTelemetry(),
      persistUserTurn: true,
      userMessageId: "u-2",
      log: { set: mocks.mockLogSet } as never,
    });

    expect(result.persistedMessageCount).toBe(2);
    expect(result.resumeOffset).toBe("off-2");

    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    const insertedRows = mocks.mockInsertValues.mock.calls[0]?.[0] as Array<{
      id: string;
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>;
    expect(insertedRows.map((row) => row.id)).toEqual(["u-2", "a-2"]);
    expect(insertedRows[0]?.metadata?.runStatus).toBe("completed");
    expect(insertedRows[1]?.metadata?.runStatus).toBe("completed");
    expect(mocks.mockInsertOnConflictDoNothing).toHaveBeenCalledTimes(1);

    expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);
    const threadPatch = mocks.mockUpdateSet.mock.calls[0]?.[0] as {
      resumeOffset?: string;
      updatedAt?: Date;
    };
    expect(threadPatch.resumeOffset).toBe("off-2");
    expect(threadPatch.updatedAt).toBeInstanceOf(Date);
  });

  it("normalizes invalid snapshot parts before persisting", async () => {
    mocks.mockMaterializeSnapshotFromDurableStream.mockResolvedValueOnce({
      messages: [
        {
          id: "a-3",
          role: "assistant",
          content: "Fallback assistant text",
          parts: [{ type: "unsupported", foo: "bar" }],
        },
      ],
      offset: "off-3",
    });
    mockSelectResults({
      thread: { resumeOffset: null },
      existingRows: [],
    });

    const result = await projectV2StreamSnapshotToDb({
      threadId: "thread-3",
      telemetry: createTelemetry(),
      persistUserTurn: false,
      log: { set: mocks.mockLogSet } as never,
    });

    expect(result.persistedMessageCount).toBe(1);
    const insertedRows = mocks.mockInsertValues.mock.calls[0]?.[0] as Array<{
      id: string;
      parts: Array<{ type: string; content?: string }>;
    }>;
    expect(insertedRows[0]?.id).toBe("a-3");
    expect(insertedRows[0]?.parts).toEqual([
      { type: "text", content: "Fallback assistant text" },
    ]);
  });
});
