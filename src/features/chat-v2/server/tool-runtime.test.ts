import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveV2Tools, V2_LAZY_TOOL_DISCOVERY_NAME } from "./tool-runtime";
import type { ResolvedV2RuntimePolicy } from "./runtime-policy";

const mocks = vi.hoisted(() => ({
  mockGetMcpTools: vi.fn(),
}));

vi.mock("~/lib/mcp/client", () => ({
  getMcpTools: mocks.mockGetMcpTools,
}));

function basePolicy(
  overrides: Partial<ResolvedV2RuntimePolicy> = {},
): ResolvedV2RuntimePolicy {
  return {
    systemPrompts: [],
    customSystemPromptAllowed: true,
    customSystemPromptProvided: false,
    includeMcpTools: true,
    includeHitlTools: true,
    lazyMcpTools: true,
    selectedServers: [],
    enabledTools: {},
    ...overrides,
  };
}

describe("resolveV2Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not resolve MCP tools when no server is selected", async () => {
    const result = await resolveV2Tools({
      policy: basePolicy(),
    });

    expect(mocks.mockGetMcpTools).not.toHaveBeenCalled();
    expect(result.tools).toHaveLength(2);
    expect(result.allowedToolNames.has("collect_form_data")).toBe(true);
    expect(result.allowedToolNames.has("resolve_duplicate_entity")).toBe(true);
  });

  it("passes explicit enabled tool policy to MCP resolution", async () => {
    mocks.mockGetMcpTools.mockResolvedValueOnce({
      serversUsed: ["alpha"],
      tools: [{ name: "search", lazy: true }],
    });

    const result = await resolveV2Tools({
      policy: basePolicy({
        selectedServers: ["alpha"],
        enabledTools: { alpha: ["search"] },
      }),
    });

    expect(mocks.mockGetMcpTools).toHaveBeenCalledWith({
      enabledTools: { alpha: ["search"] },
      lazy: true,
      selectedServers: ["alpha"],
    });
    expect(result.tools).toHaveLength(3);
    expect(result.allowedToolNames.has("search")).toBe(true);
    expect(result.allowedToolNames.has(V2_LAZY_TOOL_DISCOVERY_NAME)).toBe(true);
  });
});
