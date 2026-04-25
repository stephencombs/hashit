import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockMaterializeSnapshotFromDurableStream = vi.fn();
  const mockEnsureDurableChatSessionStream = vi.fn();
  const mockReadDurableStreamHeadOffset = vi.fn();
  const mockIsThreadRunActive = vi.fn(() => false);

  return {
    mockEnsureDurableChatSessionStream,
    mockIsThreadRunActive,
    mockMaterializeSnapshotFromDurableStream,
    mockReadDurableStreamHeadOffset,
    mockSelect,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (handler: (input: { data: string }) => Promise<unknown>) =>
        handler,
    }),
  }),
}));

vi.mock("@tanstack/zod-adapter", () => ({
  zodValidator: () => undefined,
}));

vi.mock("@durable-streams/tanstack-ai-transport", () => ({
  ensureDurableChatSessionStream: mocks.mockEnsureDurableChatSessionStream,
  materializeSnapshotFromDurableStream:
    mocks.mockMaterializeSnapshotFromDurableStream,
}));

vi.mock("~/db", () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

vi.mock("~/db/schema", () => ({
  messages: { __table: "messages" },
  threads: { __table: "threads" },
}));

vi.mock("~/shared/lib/durable-streams", () => ({
  buildChatStreamPath: (threadId: string) => `chat/${threadId}`,
  buildReadStreamUrl: (path: string) => `http://durable.local/${path}`,
  getDurableChatSessionTarget: (path: string) => ({
    writeUrl: `http://durable.local/${path}`,
    createIfMissing: true,
  }),
  getDurableReadHeaders: () => ({ Authorization: "Bearer test" }),
  isDurableStreamsConfigured: () => true,
  readDurableStreamHeadOffset: mocks.mockReadDurableStreamHeadOffset,
}));

vi.mock("~/features/chat-v1/server/thread-run-state", () => ({
  isThreadRunActive: mocks.mockIsThreadRunActive,
}));

import { getThread } from "~/features/chat-v1/server/chat-thread-server";
import type { AppMessagePart } from "~/shared/types/message-parts";

function mockThreadAndMessagesResult(params: {
  thread: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
}): void {
  const threadQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([params.thread]),
  };
  const messagesQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(params.messages),
  };

  mocks.mockSelect
    .mockImplementationOnce(() => threadQuery)
    .mockImplementationOnce(() => messagesQuery);
}

describe("getThread durable offset hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsThreadRunActive.mockReturnValue(false);
  });

  it("reads initialResumeOffset from Postgres thread row and skips durable snapshot materialization", async () => {
    mockThreadAndMessagesResult({
      thread: {
        id: "thread-1",
        title: "Test Thread",
        resumeOffset: "offset-db-123",
      },
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hello",
        },
      ],
    });

    const result = (await getThread({ data: "thread-1" })) as {
      initialResumeOffset?: string;
      messages: Array<{ id: string }>;
    };

    expect(result.initialResumeOffset).toBe("offset-db-123");
    expect(result.messages).toHaveLength(1);
    expect(
      mocks.mockMaterializeSnapshotFromDurableStream,
    ).not.toHaveBeenCalled();
    expect(mocks.mockEnsureDurableChatSessionStream).not.toHaveBeenCalled();
    expect(mocks.mockReadDurableStreamHeadOffset).not.toHaveBeenCalled();
  });

  it("uses -1 for active runs when resumeOffset is missing", async () => {
    mockThreadAndMessagesResult({
      thread: {
        id: "thread-2",
        title: "Streaming Thread",
        resumeOffset: null,
      },
      messages: [],
    });
    mocks.mockIsThreadRunActive.mockReturnValue(true);

    const result = (await getThread({ data: "thread-2" })) as {
      initialResumeOffset?: string;
    };

    expect(result.initialResumeOffset).toBe("-1");
    expect(mocks.mockReadDurableStreamHeadOffset).not.toHaveBeenCalled();
  });
});

describe("getThread — message part shape round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockIsThreadRunActive.mockReturnValue(false);
  });

  it("returns ui-spec parts with a spec object (new shape) unchanged", async () => {
    const specObject = { type: "table", rows: [{ id: 1 }] };
    const newStyleParts: AppMessagePart[] = [
      { type: "ui-spec", spec: specObject as never, specIndex: 0 },
    ];

    mockThreadAndMessagesResult({
      thread: { id: "thread-3", title: "Spec Thread", resumeOffset: "off-1" },
      messages: [
        { id: "m1", role: "assistant", content: "", parts: newStyleParts },
      ],
    });

    const result = (await getThread({ data: "thread-3" })) as {
      messages: Array<{ id: string; parts: AppMessagePart[] }>;
    };

    expect(result.messages).toHaveLength(1);
    const uiPart = result.messages[0].parts.find(
      (p) => p.type === "ui-spec",
    ) as { type: "ui-spec"; spec: unknown } | undefined;
    expect(uiPart?.spec).toEqual(specObject);
  });

  it("passes through tool-call parts with argsPreview", async () => {
    const parts: AppMessagePart[] = [
      {
        type: "tool-call",
        id: "tc-99",
        name: "search",
        arguments: '{"q":"test"}',
        argsPreview: "test",
        state: "input-complete",
      },
    ];

    mockThreadAndMessagesResult({
      thread: { id: "thread-4", title: "Tool Thread", resumeOffset: "off-2" },
      messages: [{ id: "m2", role: "assistant", content: "", parts }],
    });

    const result = (await getThread({ data: "thread-4" })) as {
      messages: Array<{ id: string; parts: AppMessagePart[] }>;
    };

    const tc = result.messages[0].parts.find((p) => p.type === "tool-call") as
      | { type: "tool-call"; argsPreview?: string }
      | undefined;
    expect(tc?.argsPreview).toBe("test");
  });
});
