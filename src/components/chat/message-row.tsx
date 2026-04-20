import { lazy, memo, Suspense } from "react";
import { parsePartialJSON } from "@tanstack/ai";
import type {
  AudioPart,
  DocumentPart,
  ImagePart,
  MessagePart,
  ToolCallPart,
  VideoPart,
} from "@tanstack/ai";
import type { Spec } from "@json-render/core";
import { BrainIcon, CheckIcon, FileIcon, WrenchIcon } from "lucide-react";
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
import { FormDisplay } from "~/components/form-display";
import { DuplicateResolutionDisplay } from "~/components/duplicate-resolution-display";
import { ToolResultDisplay } from "~/components/tool-result-display";
import type { FormSpec } from "~/lib/form-tool";
import type { DuplicateResolutionSpec, ResolutionOutput } from "~/lib/resolve-duplicate-tool";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<MessagePart>;
}

const JsonRenderDisplay = lazy(() =>
  import("~/components/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

function JsonRenderDisplayFallback() {
  return <div className="h-[220px] w-full animate-pulse rounded-md bg-muted/30" />;
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
  /**
   * Single callback for both interactive client tools. Internally resolves
   * the parked `.client()` promise via the interactive-tool registry, so
   * TanStack AI's runtime writes the tool-call part's `state: "result"` +
   * `output` and resumes the agent loop.
   */
  onResolveInteractive: (
    toolName: "collect_form_data" | "resolve_duplicate_entity",
    output: unknown,
  ) => void;
  onSaveArtifact: (
    spec: Spec,
    messageId?: string,
    specIndex?: number,
  ) => void;
}

function isToolCallPart(part: { type: string }): part is ToolCallPart {
  return part.type === "tool-call";
}

function hasCollectFormDataOutput(
  output: unknown,
): output is { data: Record<string, unknown> } {
  if (!output || typeof output !== "object") return false;
  const maybe = output as { data?: unknown };
  return (
    !!maybe.data &&
    typeof maybe.data === "object" &&
    !Array.isArray(maybe.data)
  );
}

function hasResolutionOutput(output: unknown): output is ResolutionOutput {
  if (!output || typeof output !== "object") return false;
  const maybe = output as {
    actionId?: unknown;
    values?: unknown;
    changes?: unknown;
  };
  return (
    typeof maybe.actionId === "string" &&
    !!maybe.values &&
    typeof maybe.values === "object" &&
    !Array.isArray(maybe.values) &&
    !!maybe.changes &&
    typeof maybe.changes === "object" &&
    !Array.isArray(maybe.changes)
  );
}

function resolveSourceUrl(source: {
  type: "url" | "data";
  value: string;
  mimeType?: string;
}): string {
  if (source.type === "url") return source.value;
  return `data:${source.mimeType ?? "application/octet-stream"};base64,${source.value}`;
}

function ImagePartView({ part }: { part: ImagePart }) {
  const src = resolveSourceUrl(part.source);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="block max-w-sm overflow-hidden rounded-md border border-border bg-muted/20"
    >
      <img
        src={src}
        alt="Attached image"
        loading="lazy"
        decoding="async"
        className="h-auto w-full object-contain"
      />
    </a>
  );
}

function MediaPartView({
  part,
  kind,
}: {
  part: AudioPart | VideoPart;
  kind: "audio" | "video";
}) {
  const src = resolveSourceUrl(part.source);
  return kind === "audio" ? (
    <audio
      controls
      preload="metadata"
      src={src}
      className="w-full max-w-sm rounded-md border border-border bg-muted/20"
    />
  ) : (
    <video
      controls
      preload="metadata"
      src={src}
      className="w-full max-w-sm rounded-md border border-border bg-muted/20"
    />
  );
}

function DocumentPartView({ part }: { part: DocumentPart }) {
  const src = resolveSourceUrl(part.source);
  const label = part.source.mimeType ?? "Document";
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-sm items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground hover:bg-muted/30"
    >
      <FileIcon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Open {label}</span>
    </a>
  );
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
  onResolveInteractive,
  onSaveArtifact,
}: MessageRowProps) {
  const lastPart = message.parts.at(-1);
  const lastInteractiveToolCallIndexById = new Map<string, number>();
  for (let i = 0; i < message.parts.length; i++) {
    const p = message.parts[i];
    if (
      p.type === "tool-call" &&
      (p.name === "collect_form_data" || p.name === "resolve_duplicate_entity")
    ) {
      lastInteractiveToolCallIndexById.set(p.id, i);
    }
  }

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
      p.name !== "resolve_duplicate_entity" &&
      !seenToolIds.has(p.id)
    ) {
      seenToolIds.add(p.id);
      const tr = toolResults.get(p.id);
      const done =
        messageComplete || (tr ? tr.state === "complete" : p.output !== undefined);
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
          const key = `${message.id}-${i}`;
          switch (part.type) {
            case "text":
              return (
                <MessageResponse key={key} deferMarkdown={!isStreaming}>
                  {part.content}
                </MessageResponse>
              );
            case "image":
              return <ImagePartView key={key} part={part} />;
            case "audio":
              return <MediaPartView key={key} part={part} kind="audio" />;
            case "video":
              return <MediaPartView key={key} part={part} kind="video" />;
            case "document":
              return <DocumentPartView key={key} part={part} />;
            case "tool-call": {
              const interactiveLastIndex = lastInteractiveToolCallIndexById.get(
                part.id,
              );
              // Keep only the latest entry per interactive toolCallId. The
              // stream can carry intermediate snapshots for the same call
              // (input-complete -> result), and rendering all of them creates
              // duplicate cards.
              if (
                interactiveLastIndex !== undefined &&
                interactiveLastIndex !== i
              ) {
                return null;
              }

              if (part.name === "create_plan") {
                const plan = parsePlan(part.arguments);
                if (!plan) return null;
                return (
                  <PlanDisplay
                    key={key}
                    plan={plan}
                    isStreaming={isStreaming}
                  />
                );
              }
              if (part.name === "collect_form_data") {
                let formSpec: FormSpec | null = null;
                try {
                  const parsed = parsePartialJSON(part.arguments);
                  if (
                    parsed &&
                    typeof (parsed as Record<string, unknown>).title === "string" &&
                    Array.isArray(
                      (parsed as Record<string, unknown>).fields,
                    )
                  ) {
                    formSpec = parsed as FormSpec;
                  }
                } catch {}
                if (!formSpec) return null;

                // The TanStack AI client's addToolResult writes `output` into
                // the tool-call part but leaves `state` at "input-complete".
                // Presence of `output` is the canonical "submitted" signal.
                // `output` has shape { data: Record<...> } per
                // collectFormDataTool's outputSchema.
                const isFormSubmitted = hasCollectFormDataOutput(part.output);
                if (part.output !== undefined && !isFormSubmitted) {
                  // Validation/tool errors can be attached as `output` objects
                  // that are not user submissions. Skip rendering these stale
                  // snapshots as "submitted" cards.
                  return null;
                }
                const submittedOutput = isFormSubmitted ? part.output : undefined;
                const userSubmittedData = submittedOutput?.data;

                return (
                  <FormDisplay
                    key={key}
                    spec={formSpec}
                    disabled={isFormSubmitted}
                    submittedData={userSubmittedData}
                    draftStorageKey={`collect_form_data:${part.id}`}
                    onSubmit={
                      isFormSubmitted
                        ? undefined
                        : (data) =>
                            onResolveInteractive("collect_form_data", {
                              data: data as Record<
                                string,
                                string | number | boolean
                              >,
                            })
                    }
                  />
                );
              }
              if (part.name === "resolve_duplicate_entity") {
                let dupSpec: DuplicateResolutionSpec | null = null;
                try {
                  const parsed = parsePartialJSON(part.arguments);
                  if (
                    parsed &&
                    typeof (parsed as Record<string, unknown>).title === "string" &&
                    Array.isArray((parsed as Record<string, unknown>).fields)
                  ) {
                    dupSpec = parsed as DuplicateResolutionSpec;
                  }
                } catch {}
                if (!dupSpec) return null;

                const isResolved = hasResolutionOutput(part.output);
                if (part.output !== undefined && !isResolved) {
                  return null;
                }
                const resolutionSubmittedData = isResolved
                  ? part.output
                  : undefined;

                return (
                  <DuplicateResolutionDisplay
                    key={key}
                    spec={dupSpec}
                    disabled={isResolved}
                    submittedData={
                      resolutionSubmittedData as
                        | Record<string, unknown>
                        | undefined
                    }
                    onResolve={
                      isResolved
                        ? undefined
                        : (output: ResolutionOutput) =>
                            onResolveInteractive(
                              "resolve_duplicate_entity",
                              output,
                            )
                    }
                  />
                );
              }
              // Generic tool-call: rendered in the chain-of-thought above.
              return null;
            }
            case "tool-result":
              // Handled inside the chain-of-thought activity panel above.
              return null;
            case "thinking":
              // Handled inside the chain-of-thought activity panel above.
              return null;
            default: {
              // Custom (non-TanStack) parts like ui-spec / tool-summary land
              // here and are handled by sibling sections (persistedSpecs etc).
              // The strict `never` check below catches future MessagePart
              // additions at compile time so we can decide how to render them.
              const _exhaustive: never = part;
              void _exhaustive;
              return null;
            }
          }
        })}
      </MessageContent>
      {persistedSpecs.length > 0
        ? persistedSpecs.map(({ spec, idx }) => (
            <div key={`persisted-${idx}`} className="w-full min-w-0">
              <Suspense fallback={<JsonRenderDisplayFallback />}>
                <JsonRenderDisplay
                  spec={spec}
                  isStreaming={false}
                  messageId={message.id}
                  specIndex={idx}
                  saved={savedArtifactKeys.has(`${message.id}:${idx}`)}
                  onSaveArtifact={onSaveArtifact}
                />
              </Suspense>
            </div>
          ))
        : liveSpecs && liveSpecs.length > 0
          ? liveSpecs.map((spec, idx) => (
              <div key={`live-${idx}`} className="w-full min-w-0">
                <Suspense fallback={<JsonRenderDisplayFallback />}>
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
                </Suspense>
              </div>
            ))
          : null}
    </Message>
  );
}

export const MessageRow = memo(MessageRowImpl);
