import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useModelSettings } from "~/hooks/use-model-settings";
import { useMcpSettings } from "~/hooks/use-mcp-settings";
import { artifactsByThreadQuery, type ThreadArtifact } from "~/lib/queries";
import {
  VirtualConversation,
  VirtualConversationEmptyState,
} from "~/components/chat/virtual-conversation";
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
import type { MessagePart } from "@tanstack/ai";
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

const OPTIMISTIC_ID = "optimistic-new";

export function Chat({
  threadId,
  initialMessages,
  onThreadCreated,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [specsMap, setSpecsMap] = useState<Map<string, Spec[]>>(new Map());
  // Tracks form submissions by tool call ID → submitted field values.
  // Driven by user interaction only (not by server tool execution state)
  // so the form never auto-submits due to TanStack AI's server-side auto-complete.
  const [submittedFormData, setSubmittedFormData] = useState<
    Map<string, Record<string, unknown>>
  >(new Map());
  const createdThreadIdRef = useRef<string | null>(null);
  const messagesRef = useRef<typeof messages>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

  // Prefetched by the thread route loader, so this is an immediate cache hit
  // after route navigation. Using a query here also dedupes concurrent calls.
  const { data: threadArtifacts } = useQuery({
    ...artifactsByThreadQuery(threadId ?? ""),
    enabled: !!threadId,
  });

  const savedArtifactKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of threadArtifacts ?? []) {
      if (a.messageId) {
        keys.add(`${a.messageId}:${a.specIndex ?? 0}`);
      }
    }
    return keys;
  }, [threadArtifacts]);

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
        const { spec, specIndex: idx } = data as { spec: Spec; specIndex: number };
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        if (lastMsg) {
          setSpecsMap((prev) => {
            const next = new Map(prev);
            const arr = [...(next.get(lastMsg.id) ?? [])];
            arr[idx] = spec;
            next.set(lastMsg.id, arr);
            return next;
          });
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

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
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
    async (spec: Spec, messageId?: string, specIndex = 0) => {
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
          body: JSON.stringify({ title, spec, threadId, messageId, specIndex }),
        });
        if (res.ok && threadId) {
          const created = (await res.json()) as ThreadArtifact;
          queryClient.setQueryData<ThreadArtifact[]>(
            artifactsByThreadQuery(threadId).queryKey,
            (prev = []) => [created, ...prev],
          );
        }
      } catch {
        // best-effort
      }
    },
    [threadId, queryClient],
  );

  const handleFormSubmit = useCallback(
    (toolCallId: string, data: Record<string, unknown>) => {
      setSubmittedFormData((prev) => {
        const next = new Map(prev);
        next.set(toolCallId, data);
        return next;
      });
      addToolResult({
        toolCallId,
        tool: "collect_form_data",
        output: data,
      });
    },
    [addToolResult],
  );

  const isStreaming = status !== "ready";

  // True immediately after submit and until the assistant produces any
  // visible content (text, reasoning, tool call, or live UI spec). This
  // drives the "Thinking…" indicator so the chat never feels frozen while
  // the model spins up.
  const lastMessage = messages[messages.length - 1];
  const hasAssistantContent =
    lastMessage?.role === "assistant" &&
    (lastMessage.parts.length > 0 ||
      (specsMap.get(lastMessage.id)?.length ?? 0) > 0);
  const isAwaitingResponse = isStreaming && !hasAssistantContent;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-6">
      {messages.length === 0 ? (
        <div className="flex-1 min-h-0">
          <VirtualConversationEmptyState
            icon={<MessageSquare className="size-12" />}
            title="Start a conversation"
            description="Type a message below to begin chatting"
          />
        </div>
      ) : (
        <VirtualConversation
          threadId={threadId}
          messages={messages}
          isStreaming={isStreaming}
          isAwaitingResponse={isAwaitingResponse}
          specsMap={specsMap}
          savedArtifactKeys={savedArtifactKeys}
          submittedFormData={submittedFormData}
          onFormSubmit={handleFormSubmit}
          onSaveArtifact={handleSaveArtifact}
        />
      )}

      <PromptInput onSubmit={handleSubmit} className="mt-4">
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
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
