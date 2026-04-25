import type { V2RuntimePart } from "../../types";
import { extractTextContent } from "../application/user-message";
import { normalizeRuntimeParts } from "../runtime/message-normalization";

type SnapshotMessage = {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

export type ProjectedV2MessageRole = "user" | "assistant";

export type ProjectedV2Message = {
  id: string;
  role: ProjectedV2MessageRole;
  content: string;
  parts: Array<V2RuntimePart>;
};

function asMessageRole(value: unknown): ProjectedV2MessageRole | null {
  if (value === "user" || value === "assistant") return value;
  return null;
}

function toMessageId(value: unknown, threadId: string, index: number): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return `${threadId}__snapshot__${index}`;
}

function deriveSnapshotContent(
  fallbackContent: unknown,
  parts: Array<unknown>,
): string {
  if (
    typeof fallbackContent === "string" &&
    fallbackContent.trim().length > 0
  ) {
    return fallbackContent;
  }

  const textContent = extractTextContent(parts);
  if (textContent.length > 0) {
    return textContent;
  }

  return "";
}

export function toUnknownArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

export function toProjectedV2Messages(
  threadId: string,
  snapshotMessages: Array<unknown>,
  specPartsByMessageId: Map<string, Array<unknown>>,
): Array<ProjectedV2Message> {
  const projected: Array<ProjectedV2Message> = [];

  snapshotMessages.forEach((rawMessage, index) => {
    const message = (rawMessage ?? {}) as SnapshotMessage;
    const role = asMessageRole(message.role);
    if (!role) return;

    const messageId = toMessageId(message.id, threadId, index);
    const parts = Array.isArray(message.parts) ? [...message.parts] : [];
    const eventSpecParts = specPartsByMessageId.get(messageId);
    if (eventSpecParts && eventSpecParts.length > 0) {
      parts.push(...eventSpecParts);
    }

    const content = deriveSnapshotContent(message.content, parts);
    projected.push({
      id: messageId,
      role,
      content,
      parts: normalizeRuntimeParts(parts, content),
    });
  });

  return projected;
}

export function findSupersededAssistantIds(
  messages: Array<ProjectedV2Message>,
): Array<string> {
  const superseded: Array<string> = [];
  let assistantIdsSinceLastUser: Array<string> = [];
  let hasSeenUser = false;

  const flushTurnAssistants = (): void => {
    if (assistantIdsSinceLastUser.length > 1) {
      superseded.push(...assistantIdsSinceLastUser.slice(0, -1));
    }
    assistantIdsSinceLastUser = [];
  };

  for (const message of messages) {
    if (message.role === "user") {
      flushTurnAssistants();
      hasSeenUser = true;
      continue;
    }

    if (message.role === "assistant" && hasSeenUser) {
      assistantIdsSinceLastUser.push(message.id);
    }
  }

  flushTurnAssistants();
  return superseded;
}
