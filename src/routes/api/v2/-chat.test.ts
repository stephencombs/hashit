import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockLogSet = vi.fn();
  const mockUseRequest = vi.fn(() => ({ context: { log: { set: mockLogSet } } }));
  const mockToDurableChatSessionResponse = vi.fn(
    async () =>
      new Response(null, {
        status: 202,
      }),
  );
  const mockBeginThreadRun = vi.fn();
  const mockEndThreadRun = vi.fn();
  const mockCreateV2AgentRun = vi.fn(async () => ({
    stream: (async function* () {
      yield { type: "TEXT_MESSAGE_CONTENT", delta: "ok" };
    })(),
  }));

  return {
    mockBeginThreadRun,
    mockCreateV2AgentRun,
    mockEndThreadRun,
    mockLogSet,
    mockToDurableChatSessionResponse,
    mockUseRequest,
  };
});

vi.mock("nitro/context", () => ({
  useRequest: mocks.mockUseRequest,
}));

vi.mock("@durable-streams/tanstack-ai-transport", () => ({
  toDurableChatSessionResponse: mocks.mockToDurableChatSessionResponse,
}));

vi.mock("~/lib/durable-streams", () => ({
  getDurableChatSessionTarget: () => ({
    writeUrl: "http://durable.local/chat/thread-1",
    createIfMissing: true,
  }),
}));

vi.mock("~/features/chat-v2/server/keys", () => ({
  buildV2ChatStreamPath: (threadId: string) => `v2-chat/${threadId}`,
  toV2RunStateKey: (threadId: string) => `v2:${threadId}`,
}));

vi.mock("~/lib/server/thread-run-state", () => ({
  beginThreadRun: mocks.mockBeginThreadRun,
  endThreadRun: mocks.mockEndThreadRun,
}));

vi.mock("~/features/chat-v2/server/agent-runner", () => ({
  createV2AgentRun: mocks.mockCreateV2AgentRun,
}));

import { Route } from "~/routes/api/v2/chat";

function makeRequest(messageCount: number): Request {
  const messages = Array.from({ length: messageCount }, (_, index) => ({
    id: `m-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index + 1}`,
    parts: [
      { type: "thinking", content: "internal" },
      { type: "text", content: "x".repeat(900) },
    ],
  }));

  return new Request("http://localhost/api/v2/chat?id=thread-1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      data: {},
    }),
  });
}

describe("/api/v2/chat", () => {
  const envSnapshot = {
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-test";
  });

  afterEach(() => {
    process.env.AZURE_OPENAI_API_KEY = envSnapshot.AZURE_OPENAI_API_KEY;
    process.env.AZURE_OPENAI_ENDPOINT = envSnapshot.AZURE_OPENAI_ENDPOINT;
    process.env.AZURE_OPENAI_DEPLOYMENT = envSnapshot.AZURE_OPENAI_DEPLOYMENT;
  });

  it("optimizes inbound messages before invoking the V2 agent run", async () => {
    const response = await Route.options.server.handlers.POST({
      request: makeRequest(28),
    });

    expect(response.status).toBe(202);
    expect(mocks.mockCreateV2AgentRun).toHaveBeenCalledTimes(1);
    const input = mocks.mockCreateV2AgentRun.mock.calls[0]?.[0] as {
      messages: Array<unknown>;
      middlewareFactory?: unknown;
    };
    expect(input.messages.length).toBeLessThanOrEqual(18);
    expect(typeof input.middlewareFactory).toBe("function");
    expect(mocks.mockBeginThreadRun).toHaveBeenCalledWith("v2:thread-1");
    expect(mocks.mockEndThreadRun).not.toHaveBeenCalled();
    expect(mocks.mockToDurableChatSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "await",
      }),
    );
  });
});
