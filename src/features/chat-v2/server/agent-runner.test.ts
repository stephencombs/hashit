import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMiddleware } from "@tanstack/ai";
import type { ResolvedV2RuntimePolicy } from "./runtime-policy";

const mocks = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockMaxIterations: vi.fn((count: number) => ({
    type: "maxIterations",
    count,
  })),
  mockGetAzureAdapter: vi.fn(() => ({ provider: "azure" })),
}));

vi.mock("@tanstack/ai", () => ({
  chat: mocks.mockChat,
  maxIterations: mocks.mockMaxIterations,
}));

vi.mock("~/lib/openai-adapter", () => ({
  getAzureAdapter: mocks.mockGetAzureAdapter,
}));

import { createV2AgentRun } from "./agent-runner";

function policy(
  overrides: Partial<ResolvedV2RuntimePolicy> = {},
): ResolvedV2RuntimePolicy {
  return {
    model: "gpt-4o",
    temperature: 0.4,
    maxToolIterations: 7,
    customSystemPromptAllowed: true,
    customSystemPromptProvided: false,
    systemPrompts: ["system"],
    includeMcpTools: true,
    includeHitlTools: true,
    lazyMcpTools: true,
    selectedServers: [],
    enabledTools: {},
    ...overrides,
  };
}

describe("createV2AgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockChat.mockReturnValue(
      (async function* () {
        yield { type: "RUN_FINISHED" };
      })(),
    );
  });

  it("passes resolved runtime controls and tools into chat", async () => {
    const tool = { name: "collect_form_data" } as never;
    await createV2AgentRun({
      messages: [{ role: "user", content: "hello" }],
      conversationId: "thread-1",
      runtimePolicy: policy(),
      tools: [tool],
      allowedToolNames: new Set(["collect_form_data"]),
    });

    expect(mocks.mockGetAzureAdapter).toHaveBeenCalledWith("gpt-4o");
    expect(mocks.mockMaxIterations).toHaveBeenCalledWith(7);
    expect(mocks.mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: { provider: "azure" },
        conversationId: "thread-1",
        messages: [{ role: "user", content: "hello" }],
        systemPrompts: ["system"],
        temperature: 0.4,
        tools: [tool],
      }),
    );
  });

  it("blocks tool calls that are not allowed by policy", async () => {
    const result = await createV2AgentRun({
      messages: [{ role: "user", content: "hello" }],
      runtimePolicy: policy(),
      allowedToolNames: new Set(["collect_form_data"]),
    });

    const options = mocks.mockChat.mock.calls[0]?.[0] as {
      middleware: Array<ChatMiddleware>;
    };
    expect(() =>
      options.middleware[0]?.onBeforeToolCall?.(
        {} as never,
        {
          toolName: "not_allowed",
          toolCallId: "call-1",
        } as never,
      ),
    ).toThrow('Tool "not_allowed" is not allowed by V2 policy');
    expect(result.runState).toMatchObject({
      status: "failed",
      error: 'Tool "not_allowed" is not allowed by V2 policy',
    });
  });
});
