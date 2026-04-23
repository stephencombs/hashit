import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  v2ThreadRunFinishedEvent,
  v2ThreadRunStartedEvent,
} from "../thread-activity";

const mocks = vi.hoisted(() => {
  const mockTransaction = vi.fn();
  const mockAppendV2ThreadActivityEvent = vi.fn();
  return {
    mockAppendV2ThreadActivityEvent,
    mockTransaction,
  };
});

vi.mock("~/db", () => ({
  db: {
    transaction: mocks.mockTransaction,
  },
}));

vi.mock("~/db/schema", () => ({
  v2ThreadRuns: {
    threadId: "threadId",
    runCount: "runCount",
    updatedAt: "updatedAt",
  },
}));

vi.mock("~/features/chat-v2/server/thread-activity-events.server", () => ({
  appendV2ThreadActivityEvent: mocks.mockAppendV2ThreadActivityEvent,
}));

import {
  beginV2ThreadRun,
  endV2ThreadRun,
} from "~/features/chat-v2/server/thread-run-state.server";

type MockTx = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

function createBeginTx(runCount: number): MockTx {
  const returning = vi.fn().mockResolvedValue([{ runCount }]);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return {
    insert,
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  };
}

function createEndTx(options: {
  decrementedRunCount?: number;
  deleteSucceeded?: boolean;
  existingRunCount?: number;
}): MockTx {
  const decrementReturning = vi
    .fn()
    .mockResolvedValue(
      options.decrementedRunCount == null
        ? []
        : [{ runCount: options.decrementedRunCount }],
    );
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: decrementReturning,
      })),
    })),
  }));

  const deleteReturning = vi
    .fn()
    .mockResolvedValue(options.deleteSucceeded ? [{ threadId: "thread-1" }] : []);
  const del = vi.fn(() => ({
    where: vi.fn(() => ({
      returning: deleteReturning,
    })),
  }));

  const selectLimit = vi
    .fn()
    .mockResolvedValue(
      options.existingRunCount == null ? [] : [{ runCount: options.existingRunCount }],
    );
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: selectLimit,
      })),
    })),
  }));

  return {
    insert: vi.fn(),
    update,
    delete: del,
    select,
  };
}

describe("thread-run-state.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits started edge only when run transitions 0 -> 1", async () => {
    mocks.mockTransaction.mockImplementationOnce(async (callback: any) =>
      callback(createBeginTx(1) as any),
    );
    const started = await beginV2ThreadRun("thread-1");
    expect(started.becameActive).toBe(true);
    expect(started.becameInactive).toBe(false);
    expect(started.runCount).toBe(1);
    expect(mocks.mockAppendV2ThreadActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        threadId: "thread-1",
        eventType: v2ThreadRunStartedEvent,
      }),
    );

    mocks.mockTransaction.mockImplementationOnce(async (callback: any) =>
      callback(createBeginTx(2) as any),
    );
    const continued = await beginV2ThreadRun("thread-1");
    expect(continued.becameActive).toBe(false);
    expect(continued.runCount).toBe(2);
    expect(mocks.mockAppendV2ThreadActivityEvent).toHaveBeenCalledTimes(1);
  });

  it("emits finished edge only when run transitions 1 -> 0", async () => {
    mocks.mockTransaction.mockImplementationOnce(async (callback: any) =>
      callback(
        createEndTx({
          decrementedRunCount: 3,
        }) as any,
      ),
    );
    const decremented = await endV2ThreadRun("thread-1");
    expect(decremented.becameInactive).toBe(false);
    expect(decremented.runCount).toBe(3);
    expect(mocks.mockAppendV2ThreadActivityEvent).not.toHaveBeenCalled();

    mocks.mockTransaction.mockImplementationOnce(async (callback: any) =>
      callback(
        createEndTx({
          deleteSucceeded: true,
        }) as any,
      ),
    );
    const finished = await endV2ThreadRun("thread-1");
    expect(finished.becameInactive).toBe(true);
    expect(finished.runCount).toBe(0);
    expect(mocks.mockAppendV2ThreadActivityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        threadId: "thread-1",
        eventType: v2ThreadRunFinishedEvent,
      }),
    );
  });

  it("is idempotent when ending non-existent runs", async () => {
    mocks.mockTransaction.mockImplementationOnce(async (callback: any) =>
      callback(
        createEndTx({
          deleteSucceeded: false,
          existingRunCount: undefined,
        }) as any,
      ),
    );
    const result = await endV2ThreadRun("thread-1");
    expect(result.becameInactive).toBe(false);
    expect(result.runCount).toBe(0);
    expect(mocks.mockAppendV2ThreadActivityEvent).not.toHaveBeenCalled();
  });
});
