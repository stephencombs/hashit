import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const callOrder: Array<string> = [];
  const mockToDurableChatSessionResponse = vi.fn(async () => {
    callOrder.push("durable:start");
    await Promise.resolve();
    callOrder.push("durable:end");
    return new Response(null, {
      status: 202,
    });
  });
  const mockBeginThreadRun = vi.fn();
  const mockEndThreadRun = vi.fn();
  const mockCreateV2AgentRun = vi.fn(async () => ({
    stream: (async function* () {
      yield { type: "TEXT_MESSAGE_CONTENT", delta: "ok" };
      yield { type: "RUN_FINISHED", finishReason: "stop", duration: 11 };
    })(),
    runState: {
      status: "completed",
      finishReason: "stop",
    },
  }));
  const mockProjectV2StreamSnapshotToDb = vi.fn(async () => {
    callOrder.push("project");
    return {
      persistedMessageCount: 2,
      updatedTitle: "Hello world",
      resumeOffset: "offset-2",
    };
  });
  const mockAppendV2CustomEvents = vi.fn(async () => {
    callOrder.push("append-events");
  });
  const mockWithV2JsonRenderEvents = vi.fn(
    (stream: AsyncIterable<unknown>) => stream,
  );
  const mockQueueV2ThreadTitleGeneration = vi.fn(() => {
    callOrder.push("queue-title");
  });
  const mockHasV2MessageByIdServer = vi.fn(async () => false);
  const mockIsVisionCapableModel = vi.fn(() => true);
  const mockUserMessagesContainMedia = vi.fn(() => false);
  const mockGetMcpTools = vi.fn(async () => ({
    serversUsed: ["alpha"],
    tools: [{ name: "search" }],
  }));

  return {
    callOrder,
    mockAppendV2CustomEvents,
    mockBeginThreadRun,
    mockCreateV2AgentRun,
    mockEndThreadRun,
    mockProjectV2StreamSnapshotToDb,
    mockQueueV2ThreadTitleGeneration,
    mockHasV2MessageByIdServer,
    mockIsVisionCapableModel,
    mockGetMcpTools,
    mockToDurableChatSessionResponse,
    mockUserMessagesContainMedia,
    mockWithV2JsonRenderEvents,
  };
});

vi.mock("@durable-streams/tanstack-ai-transport", () => ({
  toDurableChatSessionResponse: mocks.mockToDurableChatSessionResponse,
}));

vi.mock("~/lib/durable-streams", () => ({
  getDurableChatSessionTarget: () => ({
    writeUrl: "http://durable.local/chat/thread-1",
    createIfMissing: true,
  }),
}));

vi.mock("~/lib/multimodal-parts", () => ({
  isVisionCapableModel: mocks.mockIsVisionCapableModel,
  userMessagesContainMedia: mocks.mockUserMessagesContainMedia,
}));

vi.mock("~/lib/mcp/client", () => ({
  getMcpTools: mocks.mockGetMcpTools,
}));

vi.mock("~/features/chat-v2/server/keys", () => ({
  buildV2ChatStreamPath: (threadId: string) => `v2-chat/${threadId}`,
}));

vi.mock("~/features/chat-v2/server/thread-run-state.server", () => ({
  beginV2ThreadRun: mocks.mockBeginThreadRun,
  endV2ThreadRun: mocks.mockEndThreadRun,
}));

vi.mock("~/features/chat-v2/server/agent-runner", () => ({
  createV2AgentRun: mocks.mockCreateV2AgentRun,
}));

vi.mock("~/features/chat-v2/server/json-render-events", () => ({
  withV2JsonRenderEvents: mocks.mockWithV2JsonRenderEvents,
}));

vi.mock("~/features/chat-v2/server/stream-projection", () => ({
  projectV2StreamSnapshotToDb: mocks.mockProjectV2StreamSnapshotToDb,
}));

vi.mock("~/features/chat-v2/server/messages.server", () => ({
  hasV2MessageByIdServer: mocks.mockHasV2MessageByIdServer,
}));

vi.mock("~/features/chat-v2/server/thread-title", () => ({
  queueV2ThreadTitleGeneration: mocks.mockQueueV2ThreadTitleGeneration,
}));

vi.mock("~/features/chat-v2/server/persistence-runtime", () => ({
  appendV2CustomEvents: mocks.mockAppendV2CustomEvents,
  buildV2TerminalEvents: (input: {
    threadId: string;
    updatedTitle?: string;
    persistenceError?: string;
    runState: { status: string };
  }) => [
    ...(input.updatedTitle
      ? [
          {
            type: "CUSTOM",
            name: "thread_title_updated",
            value: {
              threadId: input.threadId,
              title: input.updatedTitle,
            },
            timestamp: 123,
          },
        ]
      : []),
    {
      type: "CUSTOM",
      name: "run_complete",
      value: { status: input.runState.status },
      timestamp: 123,
    },
    {
      type: "CUSTOM",
      name: "persistence_complete",
      value: { error: input.persistenceError ?? null },
      timestamp: 123,
    },
  ],
}));

import { Route } from "~/routes/api/v2/chat";

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/v2/chat?id=thread-1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      body ?? {
        messages: [{ id: "m-1", role: "user", content: "Hello world" }],
        data: {},
      },
    ),
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
    mocks.callOrder.length = 0;
    mocks.mockHasV2MessageByIdServer.mockResolvedValue(false);
    mocks.mockIsVisionCapableModel.mockReturnValue(true);
    mocks.mockUserMessagesContainMedia.mockReturnValue(false);
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-test";
  });

  afterEach(() => {
    process.env.AZURE_OPENAI_API_KEY = envSnapshot.AZURE_OPENAI_API_KEY;
    process.env.AZURE_OPENAI_ENDPOINT = envSnapshot.AZURE_OPENAI_ENDPOINT;
    process.env.AZURE_OPENAI_DEPLOYMENT = envSnapshot.AZURE_OPENAI_DEPLOYMENT;
  });

  it("projects only after durable await completes", async () => {
    const response = await Route.options.server.handlers.POST({
      request: makeRequest(),
    });

    expect(response.status).toBe(202);
    expect(mocks.callOrder).toEqual([
      "durable:start",
      "durable:end",
      "project",
      "append-events",
      "queue-title",
    ]);
    expect(mocks.mockProjectV2StreamSnapshotToDb).toHaveBeenCalledTimes(1);
    expect(mocks.mockAppendV2CustomEvents).toHaveBeenCalledTimes(1);
    expect(mocks.mockQueueV2ThreadTitleGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.mockWithV2JsonRenderEvents).toHaveBeenCalledTimes(1);
    expect(mocks.mockBeginThreadRun).toHaveBeenCalledWith("thread-1");
    expect(mocks.mockEndThreadRun).not.toHaveBeenCalled();
  });

  it("returns success and emits persistence_complete when projection fails", async () => {
    mocks.mockProjectV2StreamSnapshotToDb.mockRejectedValueOnce(
      new Error("projection failed"),
    );

    const response = await Route.options.server.handlers.POST({
      request: makeRequest(),
    });

    expect(response.status).toBe(202);
    const appendedEvents = mocks.mockAppendV2CustomEvents.mock
      .calls[0]?.[1] as Array<{
      name: string;
      value: { error?: string | null };
    }>;
    const persistenceComplete = appendedEvents.find(
      (event) => event.name === "persistence_complete",
    );
    expect(persistenceComplete?.value.error).toBe("projection failed");
    expect(mocks.mockQueueV2ThreadTitleGeneration).not.toHaveBeenCalled();
  });

  it("treats duplicate latest user message as regeneration", async () => {
    mocks.mockHasV2MessageByIdServer.mockResolvedValueOnce(true);

    const response = await Route.options.server.handlers.POST({
      request: makeRequest(),
    });

    expect(response.status).toBe(202);
    expect(mocks.mockToDurableChatSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        newMessages: [],
      }),
    );
    expect(mocks.mockProjectV2StreamSnapshotToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        replaceLatestAssistant: true,
      }),
    );
    expect(mocks.mockQueueV2ThreadTitleGeneration).not.toHaveBeenCalled();
  });

  it("rejects media prompts for non-vision models", async () => {
    mocks.mockUserMessagesContainMedia.mockReturnValueOnce(true);
    mocks.mockIsVisionCapableModel.mockReturnValueOnce(false);

    const response = await Route.options.server.handlers.POST({
      request: makeRequest(),
    });

    expect(response.status).toBe(415);
    expect(mocks.mockCreateV2AgentRun).not.toHaveBeenCalled();
  });

  it("passes runtime and tool preferences through the V2 policy boundary", async () => {
    const response = await Route.options.server.handlers.POST({
      request: makeRequest({
        messages: [{ id: "m-1", role: "user", content: "Hello world" }],
        data: {
          model: "gpt-4o",
          temperature: 0.2,
          systemPrompt: "Be concise.",
          maxToolIterations: 4,
          selectedServers: ["alpha"],
          enabledTools: { alpha: ["search"] },
        },
      }),
    });

    expect(response.status).toBe(202);
    expect(mocks.mockCreateV2AgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        runtimePolicy: expect.objectContaining({
          model: "gpt-4o",
          temperature: 0.2,
          maxToolIterations: 4,
          selectedServers: ["alpha"],
          enabledTools: { alpha: ["search"] },
        }),
        tools: expect.any(Array),
        allowedToolNames: expect.any(Set),
      }),
    );
  });

  it("accepts attachment-only user messages and checks the resolved model", async () => {
    mocks.mockUserMessagesContainMedia.mockReturnValueOnce(true);

    const response = await Route.options.server.handlers.POST({
      request: makeRequest({
        messages: [
          {
            id: "m-attachment",
            role: "user",
            parts: [
              {
                type: "image",
                source: {
                  type: "url",
                  value: "https://example.com/image.png",
                  mimeType: "image/png",
                },
              },
            ],
          },
        ],
        data: {
          model: "gpt-4o",
        },
      }),
    });

    expect(response.status).toBe(202);
    expect(mocks.mockIsVisionCapableModel).toHaveBeenCalledWith("gpt-4o");
    expect(mocks.mockCreateV2AgentRun).toHaveBeenCalled();
  });
});
