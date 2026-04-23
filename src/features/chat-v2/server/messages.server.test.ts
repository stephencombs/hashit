import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectedRows: Array<Record<string, unknown>> = [];
  const mockOrderBy = vi.fn(async () => selectedRows);
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    mockFrom,
    mockOrderBy,
    mockSelect,
    mockWhere,
    selectedRows,
  };
});

vi.mock("~/db", () => ({
  db: {
    select: mocks.mockSelect,
  },
}));

import { listV2ThreadMessagesServer } from "./messages.server";

describe("listV2ThreadMessagesServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedRows.length = 0;
  });

  it("returns normalized runtime messages from persisted rows", async () => {
    mocks.selectedRows.push({
      id: "m-1",
      threadId: "thread-1",
      role: "tool",
      content: "fallback",
      parts: [{ type: "unsupported" }],
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await listV2ThreadMessagesServer("thread-1");

    expect(result).toEqual([
      {
        id: "m-1",
        role: "assistant",
        parts: [{ type: "text", content: "fallback" }],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        renderText: "fallback",
      },
    ]);
  });
});
