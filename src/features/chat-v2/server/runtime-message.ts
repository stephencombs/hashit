import type { UIMessage } from "@tanstack/ai-react";
import type { Spec } from "@json-render/core";
import { z } from "zod";
import type { V2Message } from "../types";

const TOOL_CALL_STATES = [
  "awaiting-input",
  "input-streaming",
  "input-complete",
  "approval-requested",
  "approval-responded",
] as const;
const TOOL_RESULT_STATES = ["streaming", "complete", "error"] as const;

const textPartSchema = z.object({
  type: z.literal("text"),
  content: z.string(),
});

const thinkingPartSchema = z.object({
  type: z.literal("thinking"),
  content: z.string(),
});

const toolCallPartSchema = z
  .object({
    type: z.literal("tool-call"),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    state: z.enum(TOOL_CALL_STATES),
    approval: z
      .object({
        id: z.string(),
        needsApproval: z.boolean(),
        approved: z.boolean().optional(),
      })
      .optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
  })
  .passthrough();

const toolResultPartSchema = z
  .object({
    type: z.literal("tool-result"),
    toolCallId: z.string(),
    state: z.enum(TOOL_RESULT_STATES),
    content: z.string().default(""),
    error: z.string().optional(),
  })
  .passthrough();

const uiSpecPartSchema = z
  .object({
    type: z.literal("ui-spec"),
    spec: z.custom<Spec>(
      (value) => value != null && typeof value === "object",
      "Expected a json-render Spec object",
    ),
    specIndex: z.number().int().nonnegative(),
  })
  .passthrough();

const runtimePartSchema = z.union([
  textPartSchema,
  thinkingPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
  uiSpecPartSchema,
]);

export type V2RuntimePart = z.infer<typeof runtimePartSchema>;
export type V2RuntimeMessage = Omit<UIMessage, "parts"> & {
  parts: Array<V2RuntimePart>;
  renderText: string;
};

function normalizeRole(role: string): UIMessage["role"] {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }
  return "assistant";
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

function parseRuntimePart(part: unknown): V2RuntimePart | null {
  const parsed = runtimePartSchema.safeParse(part);
  if (!parsed.success) return null;
  return parsed.data;
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
