import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockEnsureDurableChatSessionStream = vi.fn();
  const mockToDurableChatSessionResponse = vi.fn(
    async () =>
      new Response(null, {
        status: 202,
      }),
  );
  const mockExtractUserMessage = vi.fn(() => ({
    id: "user-1",
    content: "hello",
    parts: [{ type: "text", content: "hello" }],
  }));
  const mockSyncPriorToolOutputs = vi.fn();
  const mockWithPersistence = vi.fn((stream: AsyncIterable<unknown>) => stream);
  const mockCreateAgentRun = vi.fn(async () => ({
    stream: (async function* () {
      yield { type: "TEXT_MESSAGE_CONTENT", delta: "ok" };
    })(),
    runState: {
      status: "completed",
      error: undefined,
    },
  }));

  return {
    mockCreateAgentRun,
    mockEnsureDurableChatSessionStream,
    mockExtractUserMessage,
    mockSyncPriorToolOutputs,
    mockToDurableChatSessionResponse,
    mockWithPersistence,
  };
});

vi.mock("@durable-streams/tanstack-ai-transport", () => ({
  ensureDurableChatSessionStream: mocks.mockEnsureDurableChatSessionStream,
  toDurableChatSessionResponse: mocks.mockToDurableChatSessionResponse,
}));

vi.mock("~/lib/chat-helpers", () => ({
  extractUserMessage: mocks.mockExtractUserMessage,
  syncPriorToolOutputs: mocks.mockSyncPriorToolOutputs,
  withPersistence: mocks.mockWithPersistence,
}));

vi.mock("~/lib/json-render-stream", () => ({
  withJsonRender: (stream: AsyncIterable<unknown>) => stream,
}));

vi.mock("~/lib/agent-runner", () => ({
  createAgentRun: mocks.mockCreateAgentRun,
}));

vi.mock("~/lib/multimodal-parts", () => ({
  isVisionCapableModel: () => true,
  userMessagesContainMedia: () => false,
}));

vi.mock("~/lib/durable-streams", () => ({
  buildChatStreamPath: (threadId: string) => `chat/${threadId}`,
  getDurableChatSessionTarget: () => ({
    writeUrl: "http://durable.local/chat/thread-1",
    createIfMissing: true,
  }),
}));

vi.mock("~/lib/server/thread-run-state", () => ({
  beginThreadRun: vi.fn(),
  endThreadRun: vi.fn(),
}));

import { Route } from "~/routes/api/chat";

function makeRequest(messages: Array<Record<string, unknown>>): Request {
  return new Request("http://localhost/api/chat?id=thread-1", {
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

describe("/api/chat P0 behavior", () => {
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

  it("does not call ensureDurableChatSessionStream on normal user turns", async () => {
    const request = makeRequest([
      {
        id: "user-1",
        role: "user",
        content: "hello",
        parts: [{ type: "text", content: "hello" }],
      },
    ]);

    const response = await Route.options.server.handlers.POST({ request });

    expect(response.status).toBe(202);
    expect(mocks.mockEnsureDurableChatSessionStream).not.toHaveBeenCalled();
    expect(mocks.mockToDurableChatSessionResponse).toHaveBeenCalledTimes(1);
    expect(mocks.mockToDurableChatSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "await",
      }),
    );
  });

  it("calls syncPriorToolOutputs only for continuation turns", async () => {
    const continuationRequest = makeRequest([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "tool-call", id: "tool-1", name: "collect_form_data" }],
      },
    ]);

    await Route.options.server.handlers.POST({ request: continuationRequest });
    expect(mocks.mockSyncPriorToolOutputs).toHaveBeenCalledTimes(1);

    mocks.mockSyncPriorToolOutputs.mockClear();

    const userTurnRequest = makeRequest([
      {
        id: "user-2",
        role: "user",
        content: "next",
        parts: [{ type: "text", content: "next" }],
      },
    ]);

    await Route.options.server.handlers.POST({ request: userTurnRequest });
    expect(mocks.mockSyncPriorToolOutputs).not.toHaveBeenCalled();
  });
});
