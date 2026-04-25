import type { MessagePart } from "@tanstack/ai";
import type { V2IncomingChatMessage } from "../contracts/chat-contract";

type ExtractedV2UserMessage = {
  id: string | undefined;
  content: string;
  parts: Array<MessagePart>;
};

export function extractTextContent(parts: Array<unknown>): string {
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as { type?: unknown; content?: unknown };
      if (value.type !== "text") return "";
      return typeof value.content === "string" ? value.content : "";
    })
    .join("");
}

export function extractV2UserMessage(
  messages: Array<V2IncomingChatMessage>,
): ExtractedV2UserMessage {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUserMessage) {
    return {
      id: undefined,
      content: "",
      parts: [],
    };
  }

  const id =
    typeof lastUserMessage.id === "string" ? lastUserMessage.id : undefined;

  if (
    typeof lastUserMessage.content === "string" &&
    lastUserMessage.content.trim().length > 0
  ) {
    return {
      id,
      content: lastUserMessage.content,
      parts: [{ type: "text", content: lastUserMessage.content }],
    };
  }

  if (Array.isArray(lastUserMessage.parts)) {
    const textContent = extractTextContent(lastUserMessage.parts);
    if (textContent.length > 0) {
      return {
        id,
        content: textContent,
        parts: [{ type: "text", content: textContent }],
      };
    }

    return {
      id,
      content: "",
      parts,
    };
  }

  return {
    id,
    content: "",
    parts: [],
  };
}
