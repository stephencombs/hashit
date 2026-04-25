import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn(async () => []);
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));

  return {
    mockReturning,
    mockSet,
    mockUpdate,
    mockWhere,
  };
});

vi.mock("~/db", () => ({
  db: {
    update: mocks.mockUpdate,
  },
}));

import { setV2ThreadTitleServer } from "./threads.server";

describe("setV2ThreadTitleServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims and persists the provided title", async () => {
    mocks.mockReturning.mockResolvedValueOnce([
      {
        id: "thread-1",
        title: "Roadmap Planning",
        source: "v2-chat",
        resumeOffset: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:01:00.000Z"),
        deletedAt: null,
        pinnedAt: null,
      },
    ]);
    const result = await setV2ThreadTitleServer({
      threadId: "thread-1",
      title: "  Roadmap Planning  ",
    });

    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Roadmap Planning",
        updatedAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({
      id: "thread-1",
      title: "Roadmap Planning",
    });
  });

  it("rejects blank titles before writing", async () => {
    await expect(
      setV2ThreadTitleServer({
        threadId: "thread-1",
        title: "   ",
      }),
    ).rejects.toThrow("Thread title is required");

    expect(mocks.mockUpdate).not.toHaveBeenCalled();
  });

  it("throws when the target thread is missing", async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);

    await expect(
      setV2ThreadTitleServer({
        threadId: "thread-missing",
        title: "Renamed",
      }),
    ).rejects.toThrow("Thread not found");
  });
});
