import { memo } from "react";
import { parsePartialJSON } from "@tanstack/ai";
import type { ToolCallPart, MessagePart } from "@tanstack/ai";
import type { Spec } from "@json-render/core";
import { BrainIcon, CheckIcon, WrenchIcon } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "~/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "~/components/ai-elements/chain-of-thought";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "~/components/ai-elements/plan";
import { JsonRenderDisplay } from "~/components/json-render-display";
import { FormDisplay } from "~/components/form-display";
import { ToolResultDisplay } from "~/components/tool-result-display";
import type { FormSpec } from "~/lib/form-tool";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<MessagePart>;
}

interface PlanData {
  title: string;
  description: string;
  steps: Array<{ title: string; description: string }>;
}

interface MessageRowProps {
  message: ChatMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  liveSpecs: Spec[] | undefined;
  savedArtifactKeys: Set<string>;
  submittedFormData: Map<string, Record<string, unknown>>;
  onFormSubmit: (toolCallId: string, data: Record<string, unknown>) => void;
  onSaveArtifact: (
    spec: Spec,
    messageId?: string,
    specIndex?: number,
  ) => void;
}

function isToolCallPart(part: { type: string }): part is ToolCallPart {
  return part.type === "tool-call";
}

function formatToolLabel(name: string, args: string): string {
  const displayName = name.replace(/__/g, " / ");
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const vals = Object.values(parsed).filter(
      (v) => typeof v === "string" || typeof v === "number",
    );
    if (vals.length > 0) {
      const summary = vals.slice(0, 2).join(", ");
      return `${displayName}: ${summary.length > 60 ? summary.slice(0, 57) + "..." : summary}`;
    }
  } catch {}
  return displayName;
}

function formatToolDescription(
  content: string | undefined,
): string | undefined {
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed))
      return `${parsed.length} result${parsed.length === 1 ? "" : "s"}`;
    if (typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed);
      return keys.length <= 3 ? keys.join(", ") : `${keys.length} fields`;
    }
  } catch {}
  return content.length > 80 ? content.slice(0, 77) + "..." : content;
}

function parsePlan(args: string): PlanData | null {
  try {
    const parsed = parsePartialJSON(args);
    if (parsed && typeof (parsed as Record<string, unknown>).title === "string")
      return parsed as PlanData;
  } catch {}
  return null;
}

function PlanDisplay({
  plan,
  isStreaming,
}: {
  plan: PlanData;
  isStreaming: boolean;
}) {
  return (
    <Plan
      isStreaming={isStreaming}
      defaultOpen
      className="min-w-full shadow-none ring-0 border border-border"
    >
      <PlanHeader>
        <div className="flex-1 space-y-1">
          <PlanTitle>{plan.title}</PlanTitle>
          {plan.description && (
            <PlanDescription>{plan.description}</PlanDescription>
          )}
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      {plan.steps && plan.steps.length > 0 && (
        <PlanContent>
          <ol className="list-inside list-decimal space-y-3 text-sm">
            {plan.steps.map((step, i) => (
              <li key={i} className="space-y-0.5">
                <span className="font-medium">{step.title}</span>
                <p className="ml-5 text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </PlanContent>
      )}
    </Plan>
  );
}

function MessageRowImpl({
  message,
  isLastMessage,
  isStreaming,
  liveSpecs,
  savedArtifactKeys,
  submittedFormData,
  onFormSubmit,
  onSaveArtifact,
}: MessageRowProps) {
  const lastPart = message.parts.at(-1);

  type ActivityStep =
    | { kind: "thinking"; text: string; isStreaming: boolean }
    | { kind: "tool"; tc: ToolCallPart; done: boolean; resultContent?: string };

  const toolResults = new Map<
    string,
    { state: string; content?: string; error?: string }
  >();
  for (const p of message.parts) {
    if ((p as { type: string }).type === "tool-result") {
      const tr = p as {
        toolCallId: string;
        state: string;
        content?: string;
        error?: string;
      };
      toolResults.set(tr.toolCallId, tr);
    }
  }

  const messageComplete = !isStreaming || !isLastMessage;

  const steps: ActivityStep[] = [];
  const seenToolIds = new Set<string>();
  for (const p of message.parts) {
    if (p.type === "thinking") {
      const prev = steps.at(-1);
      if (prev?.kind === "thinking") {
        prev.text += "\n\n" + (p as { content: string }).content;
      } else {
        steps.push({
          kind: "thinking",
          text: (p as { content: string }).content,
          isStreaming: false,
        });
      }
    } else if (
      isToolCallPart(p) &&
      p.name !== "create_plan" &&
      p.name !== "collect_form_data" &&
      !seenToolIds.has(p.id)
    ) {
      seenToolIds.add(p.id);
      const tr = toolResults.get(p.id);
      const done =
        messageComplete || (tr ? tr.state === "complete" : p.state === "result");
      steps.push({
        kind: "tool",
        tc: p,
        done,
        resultContent:
          tr?.content ?? (p.output != null ? String(p.output) : undefined),
      });
    }
  }
  if (!messageComplete && lastPart?.type === "thinking") {
    const lastThinking = steps.findLast((s) => s.kind === "thinking");
    if (lastThinking) lastThinking.isStreaming = true;
  }

  const persistedSpecs = message.parts
    .filter((p) => (p as { type: string }).type === "ui-spec")
    .map((p, idx) => {
      try {
        return {
          spec: JSON.parse((p as { content: string }).content) as Spec,
          idx,
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is { spec: Spec; idx: number } => x !== null);

  return (
    <Message
      from={message.role as "user" | "assistant"}
      key={message.id}
      id={`msg-${message.id}`}
    >
      <MessageContent>
        {steps.length > 0 &&
          (() => {
            const allDone = steps.every((s) =>
              s.kind === "thinking" ? !s.isStreaming : s.done,
            );
            const toolSummary = message.parts.find(
              (p) => (p as { type: string }).type === "tool-summary",
            ) as { content: string } | undefined;
            return (
              <ChainOfThought defaultOpen={!allDone}>
                <ChainOfThoughtHeader>
                  {toolSummary?.content ??
                    (allDone ? "Finished thinking" : "Thinking...")}
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
                          <div className="text-xs text-muted-foreground">
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
                        label={formatToolLabel(step.tc.name, step.tc.arguments)}
                        description={
                          step.done
                            ? formatToolDescription(step.resultContent) ??
                              "Complete"
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
                    <ChainOfThoughtStep
                      icon={CheckIcon}
                      label="Done"
                      status="complete"
                    />
                  )}
                </ChainOfThoughtContent>
              </ChainOfThought>
            );
          })()}
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <MessageResponse
                key={`${message.id}-${i}`}
                deferMarkdown={!isStreaming}
              >
                {part.content}
              </MessageResponse>
            );
          }
          if (isToolCallPart(part) && part.name === "create_plan") {
            const plan = parsePlan(part.arguments);
            if (plan) {
              return (
                <PlanDisplay
                  key={`${message.id}-${i}`}
                  plan={plan}
                  isStreaming={isStreaming}
                />
              );
            }
          }
          if (isToolCallPart(part) && part.name === "collect_form_data") {
            let formSpec: FormSpec | null = null;
            try {
              const parsed = parsePartialJSON(part.arguments);
              if (
                parsed &&
                typeof (parsed as Record<string, unknown>).title === "string" &&
                Array.isArray((parsed as Record<string, unknown>).fields)
              ) {
                formSpec = parsed as FormSpec;
              }
            } catch {}
            if (!formSpec) return null;

            const userSubmittedData = submittedFormData.get(part.id);
            const isFormSubmitted = !!userSubmittedData;

            return (
              <FormDisplay
                key={`${message.id}-${i}`}
                spec={formSpec}
                disabled={isFormSubmitted}
                submittedData={userSubmittedData}
                onSubmit={
                  isFormSubmitted
                    ? undefined
                    : (data) =>
                        onFormSubmit(part.id, data as Record<string, unknown>)
                }
              />
            );
          }
          return null;
        })}
      </MessageContent>
      {persistedSpecs.length > 0
        ? persistedSpecs.map(({ spec, idx }) => (
            <div key={`persisted-${idx}`} className="w-full min-w-0">
              <JsonRenderDisplay
                spec={spec}
                isStreaming={false}
                messageId={message.id}
                specIndex={idx}
                saved={savedArtifactKeys.has(`${message.id}:${idx}`)}
                onSaveArtifact={onSaveArtifact}
              />
            </div>
          ))
        : liveSpecs && liveSpecs.length > 0
          ? liveSpecs.map((spec, idx) => (
              <div key={`live-${idx}`} className="w-full min-w-0">
                <JsonRenderDisplay
                  spec={spec}
                  isStreaming={
                    isLastMessage &&
                    isStreaming &&
                    idx === liveSpecs.length - 1
                  }
                  messageId={message.id}
                  specIndex={idx}
                  saved={savedArtifactKeys.has(`${message.id}:${idx}`)}
                  onSaveArtifact={onSaveArtifact}
                />
              </div>
            ))
          : null}
    </Message>
  );
}

export const MessageRow = memo(MessageRowImpl);
