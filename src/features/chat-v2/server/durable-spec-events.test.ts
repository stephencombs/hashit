import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockStream = vi.fn();
  const mockBuildReadStreamUrl = vi.fn(
    (path: string) => `http://durable.local/${path}`,
  );
  const mockGetDurableReadHeaders = vi.fn(() => ({
    Authorization: "Bearer test",
  }));
  const mockBuildV2ChatStreamPath = vi.fn((threadId: string) => `v2-chat/${threadId}`);

  return {
    mockBuildReadStreamUrl,
    mockBuildV2ChatStreamPath,
    mockGetDurableReadHeaders,
    mockStream,
  };
});

vi.mock("@durable-streams/client", () => ({
  stream: mocks.mockStream,
}));

vi.mock("~/lib/durable-streams", () => ({
  buildReadStreamUrl: mocks.mockBuildReadStreamUrl,
  getDurableReadHeaders: mocks.mockGetDurableReadHeaders,
}));

vi.mock("./keys", () => ({
  buildV2ChatStreamPath: mocks.mockBuildV2ChatStreamPath,
}));

import { readV2UiSpecEventsByMessageId } from "./durable-spec-events";

describe("readV2UiSpecEventsByMessageId", () => {
  it("maps spec_complete custom events to active assistant message ids", async () => {
    mocks.mockStream.mockResolvedValueOnce({
      json: vi.fn(async () => [
        {
          type: "TEXT_MESSAGE_START",
          role: "assistant",
          messageId: "a-1",
        },
        {
          type: "CUSTOM",
          name: "spec_complete",
          value: {
            spec: { root: "chart-1", elements: { "chart-1": { type: "BarChart" } } },
            specIndex: 0,
          },
        },
      ]),
    });

    const map = await readV2UiSpecEventsByMessageId("thread-1");
    expect(map.get("a-1")).toEqual([
      expect.objectContaining({
        type: "ui-spec",
        specIndex: 0,
      }),
    ]);
  });
});
