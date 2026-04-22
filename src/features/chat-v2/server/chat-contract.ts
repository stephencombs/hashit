import { z } from "zod";

const v2MessagePartSchema = z.object({ type: z.string() }).passthrough();

const v2ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(v2MessagePartSchema).optional(),
});

export const v2ChatRequestSchema = z.object({
  messages: z.array(v2ChatMessageSchema),
  data: z
    .object({
      threadId: z.string().optional(),
      conversationId: z.string().optional(),
      model: z.string().optional(),
      selectedServers: z.array(z.string()).optional(),
      enabledTools: z.record(z.string(), z.array(z.string())).optional(),
      source: z.string().optional(),
      maxInputMessages: z.number().int().min(6).max(64).optional(),
      maxPartChars: z.number().int().min(200).max(6000).optional(),
    })
    .optional(),
});

export type V2IncomingChatMessage = z.infer<typeof v2ChatMessageSchema>;

const DROPPED_PART_TYPES = new Set([
  "thinking",
  "tool-call",
  "tool-result",
  "tool-summary",
  "ui-spec",
]);

const DEFAULT_MAX_INPUT_MESSAGES = 18;
const DEFAULT_MAX_PART_CHARS = 1400;

type V2MessageOptimizationStats = {
  droppedMessages: number;
  droppedParts: number;
  truncatedFields: number;
};

type OptimizedV2Messages = {
  messages: Array<V2IncomingChatMessage>;
  stats: V2MessageOptimizationStats;
};

type OptimizeV2MessagesOptions = {
  maxInputMessages?: number;
  maxPartChars?: number;
};

function truncateText(value: string | undefined, maxChars: number): {
  value: string | undefined;
  truncated: boolean;
} {
  if (!value) return { value, truncated: false };
  if (value.length <= maxChars) return { value, truncated: false };
  return {
    value: `${value.slice(0, Math.max(0, maxChars - 1))}…`,
    truncated: true,
  };
}

function sanitizePart(
  part: Record<string, unknown>,
  maxPartChars: number,
): {
  part: Record<string, unknown> | null;
  dropped: boolean;
  truncated: boolean;
} {
  const type = typeof part.type === "string" ? part.type : "unknown";
  if (DROPPED_PART_TYPES.has(type)) {
    return { part: null, dropped: true, truncated: false };
  }

  const next = { ...part };
  let truncated = false;

  if (type === "text") {
    const text = truncateText(
      typeof next.content === "string" ? next.content : undefined,
      maxPartChars,
    );
    next.content = text.value ?? "";
    truncated = text.truncated;
  }

  if (typeof next.content === "string" && type !== "text") {
    const content = truncateText(next.content, maxPartChars);
    next.content = content.value;
    truncated = truncated || content.truncated;
  }

  if (typeof next.arguments === "string") {
    const args = truncateText(next.arguments, maxPartChars);
    next.arguments = args.value;
    truncated = truncated || args.truncated;
  }

  return { part: next, dropped: false, truncated };
}

export function optimizeV2MessagesForTokenEfficiency(
  messages: Array<V2IncomingChatMessage>,
  options?: OptimizeV2MessagesOptions,
): OptimizedV2Messages {
  const maxInputMessages = options?.maxInputMessages ?? DEFAULT_MAX_INPUT_MESSAGES;
  const maxPartChars = options?.maxPartChars ?? DEFAULT_MAX_PART_CHARS;

  const selectedMessages =
    messages.length > maxInputMessages
      ? messages.slice(messages.length - maxInputMessages)
      : messages;

  const stats: V2MessageOptimizationStats = {
    droppedMessages: Math.max(0, messages.length - selectedMessages.length),
    droppedParts: 0,
    truncatedFields: 0,
  };

  const optimized: Array<V2IncomingChatMessage> = [];

  for (const message of selectedMessages) {
    const nextMessage: V2IncomingChatMessage = {
      role: message.role,
      ...(message.id ? { id: message.id } : {}),
    };

    const sanitizedParts: Array<Record<string, unknown>> = [];
    for (const part of message.parts ?? []) {
      const normalized =
        part && typeof part === "object" ? (part as Record<string, unknown>) : null;
      if (!normalized) continue;

      const { part: keptPart, dropped, truncated } = sanitizePart(
        normalized,
        maxPartChars,
      );
      if (dropped) {
        stats.droppedParts += 1;
        continue;
      }
      if (truncated) {
        stats.truncatedFields += 1;
      }
      if (keptPart) sanitizedParts.push(keptPart);
    }

    if (sanitizedParts.length > 0) {
      nextMessage.parts = sanitizedParts as Array<z.infer<typeof v2MessagePartSchema>>;
    }

    const content = truncateText(message.content, maxPartChars);
    if (content.truncated) {
      stats.truncatedFields += 1;
    }
    if (content.value) {
      nextMessage.content = content.value;
    }

    const hasTextPayload =
      typeof nextMessage.content === "string" && nextMessage.content.trim().length > 0;
    const hasPartsPayload =
      Array.isArray(nextMessage.parts) && nextMessage.parts.length > 0;

    if (!hasTextPayload && !hasPartsPayload) {
      stats.droppedMessages += 1;
      continue;
    }

    optimized.push(nextMessage);
  }

  return {
    messages: optimized,
    stats,
  };
}
