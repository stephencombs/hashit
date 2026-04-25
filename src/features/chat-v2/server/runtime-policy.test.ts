import { describe, expect, it } from "vitest";
import { resolveV2RuntimePolicy } from "./runtime-policy";

describe("resolveV2RuntimePolicy", () => {
  it("normalizes runtime controls", () => {
    const policy = resolveV2RuntimePolicy({
      data: {
        model: " gpt-4o ",
        temperature: 9,
        systemPrompt: "  Be concise.  ",
        maxToolIterations: 99,
        selectedServers: [" alpha ", "", "alpha", "beta"],
        enabledTools: {
          alpha: [" search ", "search", ""],
          beta: undefined as never,
        },
      },
    });

    expect(policy.model).toBe("gpt-4o");
    expect(policy.temperature).toBe(2);
    expect(policy.maxToolIterations).toBe(20);
    expect(policy.selectedServers).toEqual(["alpha", "beta"]);
    expect(policy.enabledTools).toEqual({
      alpha: ["search"],
      beta: [],
    });
    expect(policy.systemPrompts[0]).toBe("Be concise.");
  });

  it("keeps empty tool preferences explicit", () => {
    const policy = resolveV2RuntimePolicy({
      data: {
        selectedServers: ["alpha"],
      },
    });

    expect(policy.selectedServers).toEqual(["alpha"]);
    expect(policy.enabledTools).toEqual({ alpha: [] });
  });
});
