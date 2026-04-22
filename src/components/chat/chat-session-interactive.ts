import type { AppMessagePart } from "~/components/chat/message-row.types";
import {
  isInteractiveToolName,
  type InteractiveToolName,
} from "~/lib/interactive-tool-registry";

export function getPendingInteractiveTarget(
  messages: Array<{ id: string; role: string; parts: Array<AppMessagePart> }>,
): { messageId: string; toolCallId: string; toolName: InteractiveToolName } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

    let latestPending:
      | { toolCallId: string; toolName: InteractiveToolName }
      | null = null;
    for (const part of message.parts) {
      if ((part as { type?: string }).type !== "tool-call") continue;
      const toolCall = part as {
        id?: string;
        name?: string;
        output?: unknown;
      };
      if (
        typeof toolCall.name === "string" &&
        isInteractiveToolName(toolCall.name) &&
        typeof toolCall.id === "string" &&
        toolCall.output === undefined
      ) {
        latestPending = { toolCallId: toolCall.id, toolName: toolCall.name };
      }
    }

    if (!latestPending) return null;
    return {
      messageId: message.id,
      toolCallId: latestPending.toolCallId,
      toolName: latestPending.toolName,
    };
  }

  return null;
}
