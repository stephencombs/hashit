import { normalizeV2MessageForRuntime } from "./message-normalization";
import type { V2Message } from "../../types";

function buildMessage(overrides: Partial<V2Message>): V2Message {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "fallback",
    parts: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("normalizeV2MessageForRuntime", () => {
  it("falls back to text parts when persisted parts are empty", () => {
    const message = normalizeV2MessageForRuntime(buildMessage({ parts: [] }));

    expect(message.parts).toEqual([{ type: "text", content: "fallback" }]);
    expect(message.renderText).toBe("fallback");
  });

  it("filters invalid parts and keeps valid ui-spec/tool-result parts", () => {
    const message = normalizeV2MessageForRuntime(
      buildMessage({
        role: "tool",
        parts: [
          { type: "not-supported", content: "drop" },
          { type: "tool-result", toolCallId: "call-1", state: "complete" },
          { type: "ui-spec", spec: { component: "DataGrid" }, specIndex: 0 },
        ],
      }),
    );

    expect(message.role).toBe("assistant");
    expect(message.parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-1",
        state: "complete",
        content: "",
      },
      { type: "ui-spec", spec: { component: "DataGrid" }, specIndex: 0 },
    ]);
    expect(message.renderText).toBe("fallback");
  });
});
