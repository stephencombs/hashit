import { extractTextContent, extractV2UserMessage } from "./user-message";

describe("V2 user message extraction", () => {
  it("extracts text content from text parts only", () => {
    expect(
      extractTextContent([
        { type: "text", content: "hello" },
        { type: "image", url: "ignored" },
        { type: "text", content: " world" },
      ]),
    ).toBe("hello world");
  });

  it("preserves non-text parts when the latest user message has no text", () => {
    const imagePart = { type: "image", url: "blob://image" };

    expect(
      extractV2UserMessage([
        { role: "assistant", content: "Earlier" },
        { id: "user-1", role: "user", parts: [imagePart] },
      ]),
    ).toEqual({
      id: "user-1",
      content: "",
      parts: [imagePart],
    });
  });
});
