import { describe, expect, it } from "vitest";
import type { V2Message } from "../types";
import { normalizeV2MessageForRuntime } from "./runtime-message";

function buildMessage(overrides?: Partial<V2Message>): V2Message {
  return {
    id: "m-1",
    threadId: "thread-1",
    role: "assistant",
    content: "fallback content",
    parts: [],
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("normalizeV2MessageForRuntime", () => {
  it("coerces unknown and tool roles to assistant", () => {
    const unknownRole = normalizeV2MessageForRuntime(
      buildMessage({
        role: "mystery",
      }),
    );
    const toolRole = normalizeV2MessageForRuntime(
      buildMessage({
        role: "tool",
      }),
    );

    expect(unknownRole.role).toBe("assistant");
    expect(toolRole.role).toBe("assistant");
    expect(unknownRole.renderText).toBe("fallback content");
    expect(toolRole.renderText).toBe("fallback content");
  });

  it("keeps valid text/thinking/tool parts", () => {
    const normalized = normalizeV2MessageForRuntime(
      buildMessage({
        parts: [
          { type: "text", content: "hello" },
          { type: "thinking", content: "..." },
          {
            type: "tool-call",
            id: "tc-1",
            name: "lookup",
            arguments: "{}",
            state: "input-complete",
          },
          {
            type: "tool-result",
            toolCallId: "tc-1",
            state: "complete",
            content: "done",
          },
        ],
      }),
    );

    expect(normalized.parts).toEqual([
      { type: "text", content: "hello" },
      { type: "thinking", content: "..." },
      {
        type: "tool-call",
        id: "tc-1",
        name: "lookup",
        arguments: "{}",
        state: "input-complete",
      },
      {
        type: "tool-result",
        toolCallId: "tc-1",
        state: "complete",
        content: "done",
      },
    ]);
    expect(normalized.renderText).toBe("hello");
  });

  it("drops unsupported file attachment parts", () => {
    const normalized = normalizeV2MessageForRuntime(
      buildMessage({
        content: "fallback",
        parts: [
          {
            type: "image",
            source: { type: "url", value: "https://example.com/image.png" },
          },
          {
            type: "audio",
            source: { type: "url", value: "https://example.com/audio.mp3" },
          },
          {
            type: "video",
            source: { type: "url", value: "https://example.com/video.mp4" },
          },
          {
            type: "document",
            source: {
              type: "url",
              value: "https://example.com/document.pdf",
              mimeType: "application/pdf",
            },
          },
        ],
      }),
    );

    expect(normalized.parts).toEqual([{ type: "text", content: "fallback" }]);
    expect(normalized.renderText).toBe("fallback");
  });

  it("falls back to content text part when parts are invalid", () => {
    const normalized = normalizeV2MessageForRuntime(
      buildMessage({
        content: "use this as fallback",
        parts: [{ type: "unsupported", foo: "bar" }],
      }),
    );

    expect(normalized.parts).toEqual([
      { type: "text", content: "use this as fallback" },
    ]);
    expect(normalized.renderText).toBe("use this as fallback");
  });

  it("defaults missing tool-result content to empty string", () => {
    const normalized = normalizeV2MessageForRuntime(
      buildMessage({
        parts: [
          {
            type: "tool-result",
            toolCallId: "tc-1",
            state: "complete",
          },
        ],
      }),
    );

    expect(normalized.parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "tc-1",
        state: "complete",
        content: "",
      },
    ]);
    expect(normalized.renderText).toBe("fallback content");
  });

  it("keeps ui-spec parts for chart-only assistant responses", () => {
    const normalized = normalizeV2MessageForRuntime(
      buildMessage({
        content: "",
        parts: [
          {
            type: "ui-spec",
            spec: {
              root: "chart-1",
              elements: {
                "chart-1": {
                  type: "BarChart",
                  props: { data: [{ label: "A", value: 1 }] },
                  children: [],
                },
              },
            },
            specIndex: 0,
          },
        ],
      }),
    );

    expect(normalized.parts).toEqual([
      {
        type: "ui-spec",
        spec: {
          root: "chart-1",
          elements: {
            "chart-1": {
              type: "BarChart",
              props: { data: [{ label: "A", value: 1 }] },
              children: [],
            },
          },
        },
        specIndex: 0,
      },
    ]);
    expect(normalized.renderText).toBe("");
  });
});
