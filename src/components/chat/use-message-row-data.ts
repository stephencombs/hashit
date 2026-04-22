import { useMemo } from "react";
import type { Spec } from "@json-render/core";
import type {
  ActivityStep,
  AppMessagePart,
  ToolResultPart,
  ToolSummaryPart,
} from "~/components/chat/message-row.types";
import {
  isInteractiveToolName,
  isThinkingPart,
  isToolCallPart,
  isToolResultPart,
  isToolSummaryPart,
  isUiSpecPart,
  toToolResultContent,
} from "~/components/chat/message-row-utils";

export function useMessageRowData({
  parts,
  messageComplete,
}: {
  parts: AppMessagePart[];
  messageComplete: boolean;
}) {
  return useMemo(() => {
    const lastInteractiveToolCallIndexById = new Map<string, number>();
    const toolResults = new Map<string, ToolResultPart>();
    const steps: ActivityStep[] = [];
    const persistedSpecs: Array<{ spec: Spec; idx: number }> = [];
    const seenToolIds = new Set<string>();

    let toolSummary: ToolSummaryPart | undefined;
    const thinkingBuffer: string[] = [];

    const flushThinking = () => {
      if (thinkingBuffer.length === 0) return;
      steps.push({
        kind: "thinking",
        text: thinkingBuffer.join("\n\n"),
        isStreaming: false,
      });
      thinkingBuffer.length = 0;
    };

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.type === "tool-call" && isInteractiveToolName(part.name)) {
        lastInteractiveToolCallIndexById.set(part.id, i);
      }

      if (isToolResultPart(part)) {
        toolResults.set(part.toolCallId, part);
      }

      if (isUiSpecPart(part)) {
        persistedSpecs.push({ spec: part.spec, idx: persistedSpecs.length });
      }

      if (!toolSummary && isToolSummaryPart(part)) {
        toolSummary = part;
      }

      if (isThinkingPart(part)) {
        thinkingBuffer.push(part.content);
        continue;
      }

      flushThinking();

      if (
        isToolCallPart(part) &&
        !isInteractiveToolName(part.name) &&
        !seenToolIds.has(part.id)
      ) {
        seenToolIds.add(part.id);
        const tr = toolResults.get(part.id);
        const done =
          messageComplete || (tr ? tr.state === "complete" : part.output !== undefined);
        steps.push({
          kind: "tool",
          tc: part,
          done,
          resultContent: tr?.content ?? toToolResultContent(part.output),
          summary: tr?.summary,
        });
      }
    }

    flushThinking();

    const lastPart = parts.at(-1);
    if (!messageComplete && isThinkingPart(lastPart)) {
      const lastThinking = steps.findLast((step) => step.kind === "thinking");
      if (lastThinking) lastThinking.isStreaming = true;
    }

    return {
      lastInteractiveToolCallIndexById,
      steps,
      persistedSpecs,
      toolSummary,
    };
  }, [messageComplete, parts]);
}
