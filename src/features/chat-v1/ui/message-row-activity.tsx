import { useMemo } from "react";
import { BrainIcon, CheckIcon, WrenchIcon } from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "~/shared/ai-elements/chain-of-thought";
import { MessageResponse } from "~/shared/ai-elements/message";
import { ToolResultDisplay } from "~/shared/ui/tool-result-display";
import type { ActivityStep } from "~/features/chat-v1/ui/message-row.types";
import {
  formatToolDescription,
  formatToolLabel,
} from "~/features/chat-v1/ui/message-row-utils";

export function MessageRowActivity({
  steps,
  isStreaming,
  toolSummaryContent,
}: {
  steps: ActivityStep[];
  isStreaming: boolean;
  toolSummaryContent?: string;
}) {
  const allDone = useMemo(
    () =>
      steps.every((step) =>
        step.kind === "thinking" ? !step.isStreaming : step.done,
      ),
    [steps],
  );

  return (
    <ChainOfThought defaultOpen={!allDone}>
      <ChainOfThoughtHeader>
        {toolSummaryContent ?? (allDone ? "Finished thinking" : "Thinking...")}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step, i) => {
          if (step.kind === "thinking") {
            return (
              <ChainOfThoughtStep
                key={`think-${i}`}
                icon={BrainIcon}
                label={step.isStreaming ? "Reasoning..." : "Reasoned"}
                status={step.isStreaming ? "active" : "complete"}
              >
                <div className="text-muted-foreground text-xs">
                  <MessageResponse
                    deferMarkdown={!isStreaming}
                    mode="static"
                    className="prose-xs"
                  >
                    {step.text}
                  </MessageResponse>
                </div>
              </ChainOfThoughtStep>
            );
          }

          return (
            <ChainOfThoughtStep
              key={step.tc.id}
              icon={WrenchIcon}
              label={formatToolLabel(step.tc.name, step.tc.argsPreview)}
              description={
                step.done
                  ? (formatToolDescription(step.summary) ?? "Complete")
                  : "Running..."
              }
              status={step.done ? "complete" : "active"}
            >
              {step.done && step.resultContent != null && (
                <ToolResultDisplay output={step.resultContent} />
              )}
            </ChainOfThoughtStep>
          );
        })}
        {allDone && (
          <ChainOfThoughtStep icon={CheckIcon} label="Done" status="complete" />
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
