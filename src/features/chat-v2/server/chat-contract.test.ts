import { describe, expect, it } from "vitest";
import { v2ChatRequestSchema } from "./chat-contract";

describe("v2ChatRequestSchema", () => {
  it("accepts core V2 request fields", () => {
    const parsed = v2ChatRequestSchema.parse({
      messages: [{ role: "user", content: "Hello" }],
      data: {
        threadId: "thread-1",
        model: "gpt-4.1",
        source: "v2-chat",
      },
    });

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.data?.threadId).toBe("thread-1");
    expect(parsed.data?.source).toBe("v2-chat");
  });

  it("strips deprecated token optimization fields from data", () => {
    const parsed = v2ChatRequestSchema.parse({
      messages: [{ role: "user", content: "Hello" }],
      data: {
        threadId: "thread-1",
        maxInputMessages: 18,
        maxPartChars: 1400,
      },
    });

    expect(parsed.data?.threadId).toBe("thread-1");
    expect(parsed.data).not.toHaveProperty("maxInputMessages");
    expect(parsed.data).not.toHaveProperty("maxPartChars");
  });
});
