import type { StreamChunk } from "@tanstack/ai";
import { submitV2ChatTurn } from "./chat-turn";

async function* responseChunks(): AsyncIterable<StreamChunk> {
  yield {
    type: "TEXT_MESSAGE_CONTENT",
    delta: "Hello",
    timestamp: Date.now(),
  } as StreamChunk;
  yield {
    type: "TEXT_MESSAGE_END",
    timestamp: Date.now(),
  } as StreamChunk;
}

describe("submitV2ChatTurn", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_ENDPOINT: "https://example.test",
      AZURE_OPENAI_DEPLOYMENT: "gpt-test",
      DURABLE_STREAMS_URL: "http://127.0.0.1:9999",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("writes a new user turn, projects the stream, emits terminal events, and queues title generation", async () => {
    const createAgentRun = vi.fn(async () => ({
      stream: responseChunks(),
      runState: { status: "completed" as const },
    }));
    const resolvePolicy = vi.fn(() => ({
      model: "gpt-test",
      requestedModel: undefined,
      temperature: undefined,
      requestedTemperature: undefined,
      maxToolIterations: 5,
      requestedMaxToolIterations: undefined,
      customSystemPromptAllowed: true,
      customSystemPromptProvided: false,
      systemPrompts: [],
      includeMcpTools: true,
      includeHitlTools: true,
      lazyMcpTools: true,
      selectedServers: [],
      enabledTools: {},
    }));
    const resolveTools = vi.fn(async () => ({
      tools: [],
      allowedToolNames: new Set<string>(),
    }));
    const hasMessageById = vi.fn(async () => false);
    const projectSnapshot = vi.fn(async () => ({
      persistedMessageCount: 2,
      resumeOffset: "offset-1",
    }));
    const appendCustomEvents = vi.fn(async () => undefined);
    const terminalEvents: Array<StreamChunk> = [
      {
        type: "CUSTOM",
        name: "run_complete",
        value: { threadId: "thread-1" },
        timestamp: Date.now(),
      } as StreamChunk,
    ];
    const buildTerminalEvents = vi.fn(() => terminalEvents);
    const queueTitleGeneration = vi.fn();
    const toDurableResponse = vi.fn(async (options) => {
      const chunks: Array<StreamChunk> = [];
      for await (const chunk of options.responseStream) {
        chunks.push(chunk);
      }

      expect(options.newMessages).toEqual([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
        },
      ]);
      expect(chunks.map((chunk) => chunk.type)).toContain(
        "TEXT_MESSAGE_CONTENT",
      );
      return new Response(null, { status: 204 });
    });

    const response = await submitV2ChatTurn(
      {
        threadId: "thread-1",
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", content: "Hello" }],
          },
        ],
      },
      {
        createAgentRun,
        resolvePolicy,
        resolveTools,
        projectSnapshot,
        appendCustomEvents,
        buildTerminalEvents,
        queueTitleGeneration,
        hasMessageById,
        toDurableResponse,
      },
    );

    expect(response.status).toBe(204);
    expect(projectSnapshot).toHaveBeenCalledWith({
      threadId: "thread-1",
      replaceLatestAssistant: false,
    });
    expect(appendCustomEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        writeUrl: "http://127.0.0.1:9999/v2-chat/thread-1",
      }),
      terminalEvents,
    );
    expect(queueTitleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
      }),
    );
  });

  it("rejects empty chat requests before runtime execution", async () => {
    await expect(
      submitV2ChatTurn(
        {
          threadId: "thread-1",
          messages: [{ role: "user", content: "   " }],
        },
        {
          createAgentRun: vi.fn(),
          resolvePolicy: vi.fn(),
          resolveTools: vi.fn(),
          projectSnapshot: vi.fn(),
          appendCustomEvents: vi.fn(),
          buildTerminalEvents: vi.fn(),
          queueTitleGeneration: vi.fn(),
          hasMessageById: vi.fn(),
          toDurableResponse: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "V2 request has no usable message content",
    });
  });
});
