import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  v2ThreadRunFinishedEvent,
  v2ThreadRunStartedEvent,
  type V2ThreadActivityEventType,
} from "~/features/chat-v2/thread-activity";

type ActivityEvent = {
  id: number;
  threadId: string;
  eventType: V2ThreadActivityEventType;
  occurredAt: Date;
};

const mocks = vi.hoisted(() => {
  let events: Array<ActivityEvent> = [];
  const mockSetEvents = (next: Array<ActivityEvent>) => {
    events = [...next];
  };
  const mockPushEvent = (next: ActivityEvent) => {
    events = [...events, next];
  };
  const mockListV2ThreadActivityEventsAfter = vi.fn(
    async ({
      afterId,
      limit = 200,
      upToId,
    }: {
      afterId: number;
      limit?: number;
      upToId?: number;
    }) =>
      events
        .filter(
          (event) =>
            event.id > afterId && (upToId == null || event.id <= upToId),
        )
        .slice(0, limit),
  );
  const mockGetLatestV2ThreadActivityEventId = vi.fn(
    async () => events[events.length - 1]?.id ?? 0,
  );

  return {
    mockGetLatestV2ThreadActivityEventId,
    mockListV2ThreadActivityEventsAfter,
    mockPushEvent,
    mockSetEvents,
  };
});

vi.mock("~/features/chat-v2/server/thread-activity-events.server", () => ({
  getLatestV2ThreadActivityEventId: mocks.mockGetLatestV2ThreadActivityEventId,
  listV2ThreadActivityEventsAfter: mocks.mockListV2ThreadActivityEventsAfter,
}));

import {
  resetV2ThreadEventsStateForTests,
  Route,
} from "~/routes/api/v2/thread-events";

const decoder = new TextDecoder();

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (value: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let output = "";

  while (Date.now() < deadline) {
    const timeout = deadline - Date.now();
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Timed out reading stream")),
          timeout,
        ),
      ),
    ]);
    if (chunk.done) return output;
    output += decoder.decode(chunk.value, { stream: true });
    if (predicate(output)) return output;
  }

  throw new Error(
    `Timed out waiting for expected stream data. Received: ${output}`,
  );
}

describe("/api/v2/thread-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSetEvents([]);
    resetV2ThreadEventsStateForTests();
  });

  afterEach(() => {
    resetV2ThreadEventsStateForTests();
  });

  it("replays backlog after Last-Event-ID cursor", async () => {
    mocks.mockSetEvents([
      {
        id: 1,
        threadId: "thread-1",
        eventType: v2ThreadRunStartedEvent,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: 2,
        threadId: "thread-1",
        eventType: v2ThreadRunFinishedEvent,
        occurredAt: new Date("2026-01-01T00:00:01.000Z"),
      },
      {
        id: 3,
        threadId: "thread-2",
        eventType: v2ThreadRunStartedEvent,
        occurredAt: new Date("2026-01-01T00:00:02.000Z"),
      },
    ]);

    const abortController = new AbortController();
    const request = new Request("http://localhost/api/v2/thread-events", {
      signal: abortController.signal,
      headers: {
        "Last-Event-ID": "1",
      },
    });

    const response = await Route.options.server.handlers.GET({ request });
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Expected SSE response body");
    }

    const output = await readUntil(
      reader,
      (value) =>
        value.includes("id: 2") &&
        value.includes(`event: ${v2ThreadRunFinishedEvent}`) &&
        value.includes("id: 3"),
      2_000,
    );

    expect(output).not.toContain("id: 1");
    expect(output).toContain("id: 2");
    expect(output).toContain("id: 3");

    abortController.abort();
    await reader.cancel();
  });

  it("tails new events after replay catch-up", async () => {
    mocks.mockSetEvents([
      {
        id: 1,
        threadId: "thread-1",
        eventType: v2ThreadRunStartedEvent,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const abortController = new AbortController();
    const request = new Request("http://localhost/api/v2/thread-events", {
      signal: abortController.signal,
      headers: {
        "Last-Event-ID": "1",
      },
    });

    const response = await Route.options.server.handlers.GET({ request });
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Expected SSE response body");
    }

    // Allow replay bootstrap to complete before adding a live event.
    await Promise.resolve();
    await Promise.resolve();

    mocks.mockPushEvent({
      id: 2,
      threadId: "thread-1",
      eventType: v2ThreadRunFinishedEvent,
      occurredAt: new Date("2026-01-01T00:00:01.000Z"),
    });

    const output = await readUntil(
      reader,
      (value) =>
        value.includes("id: 2") &&
        value.includes(`event: ${v2ThreadRunFinishedEvent}`),
      3_000,
    );
    expect(output).toContain("id: 2");
    expect(output).toContain(`event: ${v2ThreadRunFinishedEvent}`);

    abortController.abort();
    await reader.cancel();
  });
});
