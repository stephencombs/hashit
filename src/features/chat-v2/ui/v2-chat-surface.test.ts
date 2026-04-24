import { describe, expect, it } from "vitest";
import type { V2RuntimeMessage } from "../server/runtime-message";
import {
  hasV2ComposerPayload,
  mergeBackfilledMessages,
  resolveV2InitialSnapMode,
  resolveV2TranscriptLayerState,
} from "./v2-chat-surface";

function makeMessage(id: string): V2RuntimeMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", content: id }],
    renderText: id,
  };
}

describe("mergeBackfilledMessages", () => {
  it("prepends missing historical messages", () => {
    const currentMessages = [makeMessage("m-3"), makeMessage("m-4")];
    const olderMessages = [makeMessage("m-1"), makeMessage("m-2")];

    const merged = mergeBackfilledMessages({
      olderMessages,
      currentMessages,
    });

    expect(merged.map((message) => message.id)).toEqual([
      "m-1",
      "m-2",
      "m-3",
      "m-4",
    ]);
  });

  it("drops duplicate ids from older pages", () => {
    const currentMessages = [makeMessage("m-3"), makeMessage("m-4")];
    const olderMessages = [makeMessage("m-2"), makeMessage("m-3")];

    const merged = mergeBackfilledMessages({
      olderMessages,
      currentMessages,
    });

    expect(merged.map((message) => message.id)).toEqual(["m-2", "m-3", "m-4"]);
  });

  it("keeps the same array when nothing new is added", () => {
    const currentMessages = [makeMessage("m-3"), makeMessage("m-4")];
    const olderMessages = [makeMessage("m-3")];

    const merged = mergeBackfilledMessages({
      olderMessages,
      currentMessages,
    });

    expect(merged).toBe(currentMessages);
  });
});

describe("resolveV2InitialSnapMode", () => {
  it("uses aggressive mode for draft threads", () => {
    const mode = resolveV2InitialSnapMode({
      isDraftThread: true,
      initialMessageCount: 10,
      enableInitialTranscriptRender: true,
    });

    expect(mode).toBe("aggressive");
  });

  it("uses minimal mode when transcript first-paint rendering is enabled", () => {
    const mode = resolveV2InitialSnapMode({
      isDraftThread: false,
      initialMessageCount: 0,
      enableInitialTranscriptRender: true,
    });

    expect(mode).toBe("minimal");
  });

  it("uses minimal mode for existing threads with persisted history", () => {
    const mode = resolveV2InitialSnapMode({
      isDraftThread: false,
      initialMessageCount: 4,
      enableInitialTranscriptRender: false,
    });

    expect(mode).toBe("minimal");
  });

  it("falls back to aggressive mode for empty non-draft sessions", () => {
    const mode = resolveV2InitialSnapMode({
      isDraftThread: false,
      initialMessageCount: 0,
      enableInitialTranscriptRender: false,
    });

    expect(mode).toBe("aggressive");
  });
});

describe("resolveV2TranscriptLayerState", () => {
  it("keeps the server transcript layer visible until the surface is ready", () => {
    const state = resolveV2TranscriptLayerState({
      enableInitialTranscriptRender: true,
      hasInitialTranscriptRenderable: true,
      isDraftThread: false,
      surfaceReady: false,
    });

    expect(state.shouldRenderInitialTranscript).toBe(true);
    expect(state.shouldShowServerTranscriptLayer).toBe(true);
    expect(state.shouldHideClientTranscriptLayer).toBe(true);
  });

  it("hides the server transcript layer once the surface is ready", () => {
    const state = resolveV2TranscriptLayerState({
      enableInitialTranscriptRender: true,
      hasInitialTranscriptRenderable: true,
      isDraftThread: false,
      surfaceReady: true,
    });

    expect(state.shouldRenderInitialTranscript).toBe(true);
    expect(state.shouldShowServerTranscriptLayer).toBe(false);
    expect(state.shouldHideClientTranscriptLayer).toBe(false);
  });

  it("disables transcript layering for draft threads", () => {
    const state = resolveV2TranscriptLayerState({
      enableInitialTranscriptRender: true,
      hasInitialTranscriptRenderable: true,
      isDraftThread: true,
      surfaceReady: false,
    });

    expect(state.shouldRenderInitialTranscript).toBe(false);
    expect(state.shouldShowServerTranscriptLayer).toBe(false);
    expect(state.shouldHideClientTranscriptLayer).toBe(false);
  });
});

describe("hasV2ComposerPayload", () => {
  it("accepts text-only messages", () => {
    expect(
      hasV2ComposerPayload({
        text: "hello",
        files: [],
      }),
    ).toBe(true);
  });

  it("accepts attachment-only messages", () => {
    expect(
      hasV2ComposerPayload({
        text: "   ",
        files: [
          {
            type: "file",
            mediaType: "image/png",
            filename: "photo.png",
            url: "data:image/png;base64,AAA",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects empty text with no files", () => {
    expect(
      hasV2ComposerPayload({
        text: "   ",
        files: [],
      }),
    ).toBe(false);
  });
});
