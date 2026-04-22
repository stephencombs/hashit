import { describe, expect, it } from "vitest";
import { optimizeV2MessagesForTokenEfficiency } from "./chat-contract";

describe("optimizeV2MessagesForTokenEfficiency", () => {
  it("drops non-text parts, truncates long content, and caps message count", () => {
    const messages = Array.from({ length: 22 }, (_, index) => ({
      id: `m-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index + 1}`,
      parts: [
        { type: "thinking", content: "internal chain of thought" },
        { type: "text", content: "x".repeat(3000) },
      ],
    }));

    const result = optimizeV2MessagesForTokenEfficiency(messages, {
      maxInputMessages: 10,
      maxPartChars: 200,
    });

    expect(result.messages).toHaveLength(10);
    expect(result.stats.droppedMessages).toBeGreaterThanOrEqual(12);
    expect(result.stats.droppedParts).toBeGreaterThan(0);
    expect(result.stats.truncatedFields).toBeGreaterThan(0);

    for (const message of result.messages) {
      for (const part of message.parts ?? []) {
        expect(part.type).not.toBe("thinking");
        if (part.type === "text") {
          const text = typeof part.content === "string" ? part.content : "";
          expect(text.length).toBeLessThanOrEqual(200);
        }
      }
    }
  });
});
