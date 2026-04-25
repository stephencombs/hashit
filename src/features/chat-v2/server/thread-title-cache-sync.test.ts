import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { V2Thread } from "../types";
import { v2ThreadSessionQueryOptions } from "../data/query-options";
import { commitV2ThreadTitle, setV2ThreadTitle } from "../data/mutations";

const mocks = vi.hoisted(() => {
  const rows = new Map<string, V2Thread>();
  const startSyncImmediate = vi.fn();
  const writeUpsert = vi.fn((thread: V2Thread) => {
    rows.set(thread.id, thread);
  });

  return {
    mockSetV2ThreadTitleServer: vi.fn(),
    rows,
    threadsCollection: {
      startSyncImmediate,
      get: vi.fn((threadId: string) => rows.get(threadId) ?? null),
      utils: {
        writeUpsert,
      },
    },
  };
});

vi.mock("../data/collections", () => ({
  getV2Collections: vi.fn(() => ({
    threadsCollection: mocks.threadsCollection,
  })),
}));

vi.mock("./threads.functions", () => ({
  createV2Thread: vi.fn(),
  deleteV2Thread: vi.fn(),
  setV2ThreadPinned: vi.fn(),
  setV2ThreadTitle: mocks.mockSetV2ThreadTitleServer,
}));

function makeThread(
  overrides: Partial<V2Thread> & Pick<V2Thread, "id" | "title">,
): V2Thread {
  return {
    id: overrides.id,
    title: overrides.title,
    source: "v2-chat",
    resumeOffset: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

describe("thread title cache sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.clear();
  });

  it("setV2ThreadTitle updates both session and sidebar caches", () => {
    const queryClient = new QueryClient();
    const threadId = "thread-1";
    const sessionThread = makeThread({
      id: threadId,
      title: "Old Title",
    });

    queryClient.setQueryData(v2ThreadSessionQueryOptions(threadId).queryKey, {
      thread: sessionThread,
      initialResumeOffset: "15",
    });

    setV2ThreadTitle(queryClient, threadId, "  New Title  ");

    const sessionAfter = queryClient.getQueryData<{
      thread: V2Thread;
      initialResumeOffset?: string;
    }>(v2ThreadSessionQueryOptions(threadId).queryKey);

    expect(sessionAfter?.thread.title).toBe("New Title");
    expect(mocks.rows.get(threadId)?.title).toBe("New Title");
  });

  it("commitV2ThreadTitle persists and reconciles both caches", async () => {
    const queryClient = new QueryClient();
    const threadId = "thread-2";
    const sessionThread = makeThread({
      id: threadId,
      title: "Draft",
    });
    const serverThread = makeThread({
      id: threadId,
      title: "Roadmap Plan",
      updatedAt: new Date("2026-01-01T00:05:00.000Z"),
    });

    mocks.mockSetV2ThreadTitleServer.mockResolvedValueOnce(serverThread);
    queryClient.setQueryData(v2ThreadSessionQueryOptions(threadId).queryKey, {
      thread: sessionThread,
      initialResumeOffset: "16",
    });

    const result = await commitV2ThreadTitle(
      queryClient,
      threadId,
      "  Roadmap Plan  ",
    );

    const sessionAfter = queryClient.getQueryData<{
      thread: V2Thread;
      initialResumeOffset?: string;
    }>(v2ThreadSessionQueryOptions(threadId).queryKey);

    expect(mocks.mockSetV2ThreadTitleServer).toHaveBeenCalledWith({
      data: {
        threadId,
        title: "Roadmap Plan",
      },
    });
    expect(mocks.rows.get(threadId)?.title).toBe("Roadmap Plan");
    expect(sessionAfter?.thread).toEqual(serverThread);
    expect(result).toEqual(serverThread);
  });
});
