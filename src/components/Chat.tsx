import { useRef, useState } from "react";
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
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "~/components/ai-elements/reasoning";
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
import { MessageSquare } from "lucide-react";
import type { ChatStatus } from "ai";
import type { ToolCallPart } from "@tanstack/ai";
import type { Thread } from "~/lib/schemas";

interface ChatProps {
  threadId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    parts: Array<{ type: "text"; content: string }>;
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
  const [toolSummary, setToolSummary] = useState<string | null>(null);
  const createdThreadIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

  const navigateIfReady = () => {
    if (!threadId && createdThreadIdRef.current && onThreadCreated) {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      onThreadCreated(createdThreadIdRef.current);
      createdThreadIdRef.current = null;
    }
  };

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    connection: fetchServerSentEvents("/api/chat"),
    initialMessages: initialMessages as Array<{
      id: string;
      role: "user" | "assistant";
      parts: Array<{ type: "text"; content: string }>;
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
        navigateIfReady();
      }
      if (eventType === "tool_summary") {
        setToolSummary((data as { summary: string }).summary);
      }
    },
    onFinish: () => {
      // Navigation is handled by persistence_complete custom event instead,
      // which fires after the full server-side stream completes (including
      // tool execution in the agentic loop). onFinish fires on RUN_FINISHED
      // which can happen mid-stream before tool results return.
    },
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    setToolSummary(null);

    if (!threadId) {
      const now = new Date();
      queryClient.setQueryData<Thread[]>(["threads"], (old = []) => [
        {
          id: OPTIMISTIC_ID,
          title: "Untitled",
          createdAt: now,
          updatedAt: now,
        },
        ...old,
      ]);
    }

    sendMessage(message.text);
    setInput("");
  };

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

              const thinkingParts = message.parts.filter(
                (p) => p.type === "thinking",
              );
              const thinkingText = thinkingParts
                .map((p) => (p as { content: string }).content)
                .join("\n\n");
              const isThinkingStreaming =
                isLastMessage &&
                isStreaming &&
                lastPart?.type === "thinking";

              const mcpToolPartsDeduped = new Map<string, ToolCallPart>();
              for (const p of message.parts) {
                if (isToolCallPart(p) && p.name !== "create_plan") {
                  mcpToolPartsDeduped.set(p.id, p);
                }
              }
              const mcpToolParts = [...mcpToolPartsDeduped.values()];

              return (
                <Message
                  from={message.role as "user" | "assistant"}
                  key={message.id}
                >
                  <MessageContent>
                    {thinkingText && (
                      <Reasoning isStreaming={isThinkingStreaming}>
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {thinkingText}
                        </ReasoningContent>
                      </Reasoning>
                    )}
                    {mcpToolParts.length > 0 && (() => {
                      const allComplete = mcpToolParts.every((p) => (p as ToolCallPart).state === "result");
                      const persistedSummary = message.parts.find(
                        (p) => (p as { type: string }).type === "tool-summary",
                      ) as { content: string } | undefined;
                      const header = toolSummary ?? persistedSummary?.content ?? "Using tools";
                      return (
                      <ChainOfThought
                        key={allComplete ? "done" : "active"}
                        defaultOpen={!allComplete}
                      >
                        <ChainOfThoughtHeader>
                          {header}
                        </ChainOfThoughtHeader>
                        <ChainOfThoughtContent>
                          {mcpToolParts.map((part) => {
                            const tc = part as ToolCallPart;
                            return (
                              <ChainOfThoughtStep
                                key={tc.id}
                                label={tc.name.replace(/__/g, " / ")}
                                description={
                                  tc.state === "result"
                                    ? "Complete"
                                    : "Running..."
                                }
                                status={
                                  tc.state === "result"
                                    ? "complete"
                                    : "active"
                                }
                              />
                            );
                          })}
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
                      return null;
                    })}
                  </MessageContent>
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
