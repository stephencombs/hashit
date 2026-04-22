import type { MessagePart } from "@tanstack/ai";
import type { V2IncomingChatMessage } from "./chat-contract";

export const ATTACHMENT_ONLY_CONTENT_PREFIX = "[attachments]";

type ExtractedV2UserMessage = {
  id: string | undefined;
  content: string;
  parts: Array<MessagePart>;
};

function summarizePartForPlaceholder(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const value = part as { type?: unknown };
  if (value.type === "image") return "image";
  if (value.type === "audio") return "audio";
  if (value.type === "video") return "video";
  if (value.type === "document") return "document";
  return null;
}

function extractTextContent(parts: Array<unknown>): string {
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
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUserMessage) {
    return {
      id: undefined,
      content: "",
      parts: [],
    };
  }

  const id = typeof lastUserMessage.id === "string" ? lastUserMessage.id : undefined;

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
    const parts = lastUserMessage.parts as Array<MessagePart>;
    if (textContent.length > 0) {
      return {
        id,
        content: textContent,
        parts,
      };
    }

    const summaries = lastUserMessage.parts
      .map((part) => summarizePartForPlaceholder(part))
      .filter((value): value is string => value !== null);

    if (summaries.length > 0) {
      return {
        id,
        content: `${ATTACHMENT_ONLY_CONTENT_PREFIX} ${summaries.join(", ")}`,
        parts,
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
