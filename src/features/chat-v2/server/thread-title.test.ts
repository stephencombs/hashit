import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockChat = vi.fn();
  const mockGetAzureAdapter = vi.fn(() => ({ provider: "azure" }));
  const mockAppendV2CustomEvents = vi.fn(async () => undefined);
  const mockSelect = vi.fn();
  const mockUpdateReturning = vi.fn(async () => [{ id: "thread-1" }]);
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockAppendV2CustomEvents,
    mockChat,
    mockGetAzureAdapter,
    mockSelect,
    mockUpdate,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdateWhere,
  };
});

vi.mock("@tanstack/ai", () => ({
  chat: mocks.mockChat,
}));

vi.mock("~/shared/lib/openai-adapter", () => ({
  getAzureAdapter: mocks.mockGetAzureAdapter,
}));

vi.mock("~/features/chat-v2/server/persistence-runtime", () => ({
  appendV2CustomEvents: mocks.mockAppendV2CustomEvents,
  createV2CustomChunk: (name: string, value: unknown) => ({
    type: "CUSTOM",
    name,
    value,
    timestamp: 123,
  }),
}));

vi.mock("~/db", () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

vi.mock("~/db/schema", () => ({
  v2Messages: {
    threadId: "thread_id",
    role: "role",
    content: "content",
    createdAt: "created_at",
  },
  v2Threads: {
    id: "id",
    title: "title",
  },
}));

import { queueV2ThreadTitleGeneration } from "./thread-title";

function mockSelectResults(params: {
  threadTitle: string | null;
  firstUserContent?: string | null;
}) {
  const threadSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () =>
      params.threadTitle === null ? [] : [{ title: params.threadTitle }],
    ),
  };

  const firstUserSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(async () =>
      params.firstUserContent === null || params.firstUserContent === undefined
        ? []
        : [{ content: params.firstUserContent }],
    ),
  };

  mocks.mockSelect.mockImplementationOnce(() => threadSelect);
  if (params.firstUserContent !== undefined) {
    mocks.mockSelect.mockImplementationOnce(() => firstUserSelect);
  }
}

function makeTitleStream(title: string) {
  return (async function* () {
    yield { type: "TEXT_MESSAGE_CONTENT", delta: title };
  })();
}

describe("queueV2ThreadTitleGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockChat.mockImplementation(() =>
      makeTitleStream("Roadmap planning"),
    );
  });

  it("generates and persists a title for an untitled thread", async () => {
    mockSelectResults({
      threadTitle: "Untitled",
      firstUserContent: "Plan a quarterly roadmap",
    });

    queueV2ThreadTitleGeneration({
      threadId: "thread-1",
      streamTarget: {
        writeUrl: "http://durable.local/v2-chat/thread-1",
      } as never,
    });

    await vi.waitFor(() => {
      expect(mocks.mockAppendV2CustomEvents).toHaveBeenCalledTimes(1);
    });

    expect(mocks.mockChat).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Roadmap planning",
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("skips generation when the thread already has a non-generic title", async () => {
    mockSelectResults({
      threadTitle: "Customer follow-up notes",
    });

    queueV2ThreadTitleGeneration({
      threadId: "thread-1",
      streamTarget: {
        writeUrl: "http://durable.local/v2-chat/thread-1",
      } as never,
    });

    await vi.waitFor(() => {
      expect(mocks.mockChat).not.toHaveBeenCalled();
    });

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
    expect(mocks.mockAppendV2CustomEvents).not.toHaveBeenCalled();
  });
});
