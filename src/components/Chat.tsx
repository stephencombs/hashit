import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { parsePartialJSON } from "@tanstack/ai";
import { useQueryClient } from "@tanstack/react-query";
import { useModelSettings } from "~/hooks/use-model-settings";
import { useMcpSettings } from "~/hooks/use-mcp-settings";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "~/components/ai-elements/conversation";
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
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputBody,
} from "~/components/ai-elements/prompt-input";
import { JsonRenderDisplay } from "~/components/json-render-display";
import { FormDisplay } from "~/components/form-display";
import { BrainIcon, CheckIcon, MessageSquare, WrenchIcon } from "lucide-react";
import type { FormSpec } from "~/lib/form-tool";
import type { ChatStatus } from "ai";
import type { ToolCallPart, MessagePart } from "@tanstack/ai";
import type { Spec } from "@json-render/core";
import type { Thread } from "~/lib/schemas";

interface ChatProps {
  threadId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    parts: Array<MessagePart>;
  }>;
  onThreadCreated?: (threadId: string) => void;
}

interface PlanData {
  title: string;
  description: string;
  steps: Array<{ title: string; description: string }>;
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
                <p className="ml-5 text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </PlanContent>
      )}
    </Plan>
  );
}

const OPTIMISTIC_ID = "optimistic-new";

export function Chat({
  threadId,
  initialMessages,
  onThreadCreated,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [specsMap, setSpecsMap] = useState<Map<string, Spec>>(new Map());
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  // Tracks form submissions by tool call ID → submitted field values.
  // Driven by user interaction only (not by server tool execution state)
  // so the form never auto-submits due to TanStack AI's server-side auto-complete.
  const [submittedFormData, setSubmittedFormData] = useState<
    Map<string, Record<string, unknown>>
  >(new Map());
  const createdThreadIdRef = useRef<string | null>(null);
  const messagesRef = useRef<typeof messages>([]);
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

  useEffect(() => {
    if (!threadId) return;
    fetch("/api/artifacts")
      .then((r) => r.json())
      .then((artifacts: Array<{ messageId: string | null; threadId: string | null }>) => {
        const ids = new Set<string>();
        for (const a of artifacts) {
          if (a.threadId === threadId && a.messageId) ids.add(a.messageId);
        }
        setSavedMessageIds(ids);
      })
      .catch(() => {});
  }, [threadId]);

  const navigateIfReady = () => {
    if (!threadId && createdThreadIdRef.current && onThreadCreated) {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      onThreadCreated(createdThreadIdRef.current);
      createdThreadIdRef.current = null;
    }
  };

  const { messages, sendMessage, status, addToolResult } = useChat({
    id: threadId,
    connection: fetchServerSentEvents("/api/chat"),
    initialMessages: initialMessages as Array<{
      id: string;
      role: "user" | "assistant";
      parts: Array<MessagePart>;
    }>,
    body: { threadId, model, temperature, systemPrompt, selectedServers, enabledTools },
    onCustomEvent: (
      eventType: string,
      data: unknown,
      _context: { toolCallId?: string },
    ) => {
      if (eventType === "thread_created") {
        const { threadId: realId } = data as { threadId: string };
        createdThreadIdRef.current = realId;

        queryClient.setQueryData<Thread[]>(["threads"], (old = []) =>
          old.map((t) =>
            t.id === OPTIMISTIC_ID ? { ...t, id: realId } : t,
          ),
        );
      }
      if (eventType === "persistence_complete") {
        queryClient.invalidateQueries({ queryKey: ["threads"] });
        navigateIfReady();
      }
      if (eventType === "spec_patch" || eventType === "spec_complete") {
        const spec = (data as { spec: Spec }).spec;
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        if (lastMsg) {
          setSpecsMap((prev) => new Map(prev).set(lastMsg.id, spec));
        }
      }
    },
    onFinish: () => {
      // Navigation is handled by persistence_complete custom event instead,
      // which fires after the full server-side stream completes (including
      // tool execution in the agentic loop). onFinish fires on RUN_FINISHED
      // which can happen mid-stream before tool results return.
    },
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;

    const now = new Date();
    if (!threadId) {
      queryClient.setQueryData<Thread[]>(["threads"], (old = []) => [
        {
          id: OPTIMISTIC_ID,
          title: "Untitled",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          pinnedAt: null,
        },
        ...old,
      ]);
    } else {
      queryClient.setQueryData<Thread[]>(["threads"], (old = []) =>
        old
          .map((t) => (t.id === threadId ? { ...t, updatedAt: now } : t))
          .sort((a, b) => {
            const aPinned = a.pinnedAt ? 0 : 1;
            const bPinned = b.pinnedAt ? 0 : 1;
            if (aPinned !== bPinned) return aPinned - bPinned;
            return b.updatedAt.getTime() - a.updatedAt.getTime();
          }),
      );
    }

    sendMessage(message.text);
    setInput("");
  };

  const handleSaveArtifact = useCallback(
    async (spec: Spec, messageId?: string) => {
      const root = spec.elements?.[spec.root] as
        | { props?: { title?: string } }
        | undefined;
      const title =
        root?.props?.title ||
        `Chart – ${new Date().toLocaleDateString()}`;

      try {
        const res = await fetch("/api/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, spec, threadId, messageId }),
        });
        if (res.ok && messageId) {
          setSavedMessageIds((prev) => new Set(prev).add(messageId));
        }
      } catch {
        // best-effort
      }
    },
    [threadId],
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-6">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-12" />}
              title="Start a conversation"
              description="Type a message below to begin chatting"
            />
          ) : (
            messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              const isStreaming = status !== "ready";
              const lastPart = message.parts.at(-1);

              type ActivityStep =
                | { kind: "thinking"; text: string; isStreaming: boolean }
                | { kind: "tool"; tc: ToolCallPart; done: boolean; resultContent?: string };

              const toolResults = new Map<string, { state: string; content?: string; error?: string }>();
              for (const p of message.parts) {
                if ((p as { type: string }).type === "tool-result") {
                  const tr = p as { toolCallId: string; state: string; content?: string; error?: string };
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
                } else if (isToolCallPart(p) && p.name !== "create_plan" && p.name !== "collect_form_data" && !seenToolIds.has(p.id)) {
                  seenToolIds.add(p.id);
                  const tr = toolResults.get(p.id);
                  const done = messageComplete || (tr ? tr.state === "complete" : p.state === "result");
                  steps.push({
                    kind: "tool",
                    tc: p,
                    done,
                    resultContent: tr?.content ?? (p.output != null ? String(p.output) : undefined),
                  });
                }
              }
              if (!messageComplete && lastPart?.type === "thinking") {
                const lastThinking = steps.findLast((s) => s.kind === "thinking");
                if (lastThinking) lastThinking.isStreaming = true;
              }

              return (
                <Message
                  from={message.role as "user" | "assistant"}
                  key={message.id}
                  id={`msg-${message.id}`}
                >
                  <MessageContent>
                    {steps.length > 0 && (() => {
                      const allDone = steps.every((s) =>
                        s.kind === "thinking" ? !s.isStreaming : s.done,
                      );
                      const toolSummary = message.parts.find(
                        (p) => (p as { type: string }).type === "tool-summary",
                      ) as { content: string } | undefined;
                      return (
                        <ChainOfThought defaultOpen={!allDone}>
                          <ChainOfThoughtHeader>
                            {toolSummary?.content
                              ?? (allDone ? "Finished thinking" : "Thinking...")}
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
                                      <MessageResponse mode="static" className="prose-xs">
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
                                      ? formatToolDescription(step.resultContent) ?? "Complete"
                                      : "Running..."
                                  }
                                  status={step.done ? "complete" : "active"}
                                />
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
                          <MessageResponse key={`${message.id}-${i}`}>
                            {part.content}
                          </MessageResponse>
                        );
                      }
                      if (
                        isToolCallPart(part) &&
                        part.name === "create_plan"
                      ) {
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
                      if (
                        isToolCallPart(part) &&
                        part.name === "collect_form_data"
                      ) {
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

                        // Only consider submitted when the user has actually clicked
                        // Submit — never rely on part.state or tool-result parts, which
                        // reflect server-side execution state and would auto-submit the form.
                        const userSubmittedData = submittedFormData.get(part.id);
                        const isFormSubmitted = !!userSubmittedData;

                        return (
                          <FormDisplay
                            key={`${message.id}-${i}`}
                            spec={formSpec}
                            disabled={isFormSubmitted}
                            submittedData={userSubmittedData}
                            onSubmit={isFormSubmitted ? undefined : (data) => {
                              setSubmittedFormData((prev) => {
                                const next = new Map(prev);
                                next.set(part.id, data as Record<string, unknown>);
                                return next;
                              });
                              addToolResult({
                                toolCallId: part.id,
                                tool: "collect_form_data",
                                output: data,
                              });
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                  {(() => {
                    const persistedSpec = message.parts.find(
                      (p) => (p as { type: string }).type === "ui-spec",
                    ) as { content: string } | undefined;
                    const mapSpec = specsMap.get(message.id);

                    if (persistedSpec) {
                      try {
                        const spec = JSON.parse(persistedSpec.content) as Spec;
                        return (
                          <div className="w-full min-w-0">
                            <JsonRenderDisplay
                              spec={spec}
                              isStreaming={false}
                              saved={savedMessageIds.has(message.id)}
                              onSaveArtifact={(s) =>
                                handleSaveArtifact(s, message.id)
                              }
                            />
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    }

                    if (mapSpec) {
                      return (
                        <div className="w-full min-w-0">
                          <JsonRenderDisplay
                            spec={mapSpec}
                            isStreaming={isLastMessage && isStreaming}
                            saved={savedMessageIds.has(message.id)}
                            onSaveArtifact={(s) =>
                              handleSaveArtifact(s, message.id)
                            }
                          />
                        </div>
                      );
                    }

                    return null;
                  })()}
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="mt-4">
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <div />
          <PromptInputSubmit
            disabled={!input.trim() && status === "ready"}
            status={status as ChatStatus}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
