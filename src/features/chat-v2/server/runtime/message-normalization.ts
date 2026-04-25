import type { UIMessage } from "@tanstack/ai-react";
import type { V2Message, V2RuntimeMessage, V2RuntimePart } from "../../types";
import { v2RuntimePartSchema } from "../../types";

function normalizeRole(role: string): UIMessage["role"] {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }
  return "assistant";
}

function parseRuntimePart(part: unknown): V2RuntimePart | null {
  const parsed = v2RuntimePartSchema.safeParse(part);
  if (!parsed.success) return null;
  return parsed.data;
}

export function normalizeRuntimeParts(
  parts: unknown,
  fallbackContent: string,
): Array<V2RuntimePart> {
  const rawParts = Array.isArray(parts) ? parts : [];
  const normalizedParts = rawParts
    .map((part) => parseRuntimePart(part))
    .filter((part): part is V2RuntimePart => part !== null);

  if (normalizedParts.length > 0) {
    return normalizedParts;
  }

  return [
    {
      type: "text",
      content: fallbackContent,
    },
  ];
}

function buildRenderText(
  parts: Array<V2RuntimePart>,
  fallbackContent: string,
): string {
  const textContent = parts
    .filter(
      (part): part is Extract<V2RuntimePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.content)
    .join("\n")
    .trim();

  if (textContent.length > 0) return textContent;
  return fallbackContent.trim();
}

export function normalizeV2MessageForRuntime(
  message: V2Message,
): V2RuntimeMessage {
  const parts = normalizeRuntimeParts(message.parts, message.content);
  return {
    id: message.id,
    role: normalizeRole(message.role),
    parts,
    createdAt: message.createdAt,
    renderText: buildRenderText(parts, message.content),
  };
}

export function normalizeV2MessagesForRuntime(
  messages: Array<V2Message>,
): Array<V2RuntimeMessage> {
  return messages.map((message) => normalizeV2MessageForRuntime(message));
}
