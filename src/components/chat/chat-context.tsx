import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import type { MessagePart } from "@tanstack/ai";
import type { UseChatReturn } from "@tanstack/ai-react";

type ChatStatus = UseChatReturn["status"];
import type { Spec } from "@json-render/core";

import { useModelSettings } from "~/hooks/use-model-settings";
import { useMcpSettings } from "~/hooks/use-mcp-settings";
import { artifactsByThreadQuery, type ThreadArtifact } from "~/lib/queries";
import type { Thread } from "~/lib/schemas";
import {
  VirtualConversation,
  VirtualConversationEmptyState,
} from "~/components/chat/virtual-conversation";
import type { ChatMessage } from "~/components/chat/message-row";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputBody,
} from "~/components/ai-elements/prompt-input";

type ChatMessageShape = {
  id: string;
  role: "user" | "assistant";
  parts: Array<MessagePart>;
};

/** Conversation + message actions — excludes composer `input` so typing does not re-render the message list. */
interface ChatMessagesContextValue {
  threadId: string | undefined;
  messages: ReturnType<typeof useChat>["messages"];
  status: ChatStatus;
  isStreaming: boolean;
  isAwaitingResponse: boolean;
  specsMap: Map<string, Spec[]>;
  savedArtifactKeys: Set<string>;
  submittedFormData: Map<string, Record<string, unknown>>;
  handleFormSubmit: (toolCallId: string, data: Record<string, unknown>) => void;
  handleSaveArtifact: (
    spec: Spec,
    messageId?: string,
    specIndex?: number,
  ) => void;
}

/** Prompt field + submit — separate context so parent updates do not cascade to Streamdown/message rows. */
interface ChatComposerContextValue {
  input: string;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSubmit: (message: PromptInputMessage) => void;
  status: ChatStatus;
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(
  null,
);
const ChatComposerContext = createContext<ChatComposerContextValue | null>(
  null,
);

const OPTIMISTIC_ID = "optimistic-new";

export interface ChatProviderProps {
  threadId?: string;
  initialMessages?: Array<ChatMessageShape>;
  onThreadCreated?: (threadId: string) => void;
  children: ReactNode;
}

export function ChatProvider({
  threadId,
  initialMessages,
  onThreadCreated,
  children,
}: ChatProviderProps) {
  const [input, setInput] = useState("");
  const [specsMap, setSpecsMap] = useState<Map<string, Spec[]>>(new Map());
  // Tracks form submissions by tool call ID → submitted field values.
  // Driven by user interaction only (not by server tool execution state)
  // so the form never auto-submits due to TanStack AI's server-side auto-complete.
  const [submittedFormData, setSubmittedFormData] = useState<
    Map<string, Record<string, unknown>>
  >(new Map());
  const createdThreadIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();

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

  const messagesRef = useRef<Array<{ id: string }>>([]);

  const navigateIfReady = () => {
    if (!threadId && createdThreadIdRef.current && onThreadCreated) {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      onThreadCreated(createdThreadIdRef.current);
      createdThreadIdRef.current = null;
    }
  };

  const {
    messages,
    sendMessage,
    status,
    addToolResult,
    setMessages,
    stop,
  } = useChat({
    id: threadId,
    connection: fetchServerSentEvents("/api/chat"),
    initialMessages: initialMessages as Array<ChatMessageShape>,
    body: {
      threadId,
      model,
      temperature,
      systemPrompt,
      selectedServers,
      enabledTools,
    },
    onCustomEvent: (
      eventType: string,
      data: unknown,
      _context: { toolCallId?: string },
    ) => {
      if (eventType === "thread_created") {
        const { threadId: realId } = data as { threadId: string };
        createdThreadIdRef.current = realId;

        queryClient.setQueryData<Thread[]>(["threads"], (old = []) =>
          old.map((t) => (t.id === OPTIMISTIC_ID ? { ...t, id: realId } : t)),
        );
      }
      if (eventType === "persistence_complete") {
        queryClient.invalidateQueries({ queryKey: ["threads"] });
        navigateIfReady();
      }
      if (eventType === "spec_patch" || eventType === "spec_complete") {
        const { spec, specIndex: idx } = data as {
          spec: Spec;
          specIndex: number;
        };
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

  // Sync chat state on thread switch without remounting ChatProvider.
  // The route loader prefetches `threadDetailQuery`, so by the time
  // `threadId` changes here the parent's `initialMessages` already reflects
  // the new thread and we can swap messages synchronously before paint.
  const lastThreadIdRef = useRef<string | undefined>(threadId);
  useLayoutEffect(() => {
    if (lastThreadIdRef.current === threadId) return;
    lastThreadIdRef.current = threadId;

    stop();
    setMessages(
      (initialMessages as Array<ChatMessageShape> | undefined) ?? [],
    );
    setSpecsMap(new Map());
    setSubmittedFormData(new Map());
    setInput("");
    createdThreadIdRef.current = null;
  }, [threadId, initialMessages, stop, setMessages]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim()) return;

      const now = new Date();
      if (!threadId) {
        queryClient.setQueryData<Thread[]>(["threads"], (old = []) => [
          {
            id: OPTIMISTIC_ID,
            title: "Untitled",
            source: null,
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
    },
    [threadId, queryClient, sendMessage],
  );

  const handleSaveArtifact = useCallback(
    async (spec: Spec, messageId?: string, specIndex = 0) => {
      const root = spec.elements?.[spec.root] as
        | { props?: { title?: string } }
        | undefined;
      const title =
        root?.props?.title || `Chart – ${new Date().toLocaleDateString()}`;

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
  const lastMessage = messages[messages.length - 1];
  const hasAssistantContent =
    lastMessage?.role === "assistant" &&
    (lastMessage.parts.length > 0 ||
      (specsMap.get(lastMessage.id)?.length ?? 0) > 0);
  const isAwaitingResponse = isStreaming && !hasAssistantContent;

  const chatStatus: ChatStatus = status;

  const messagesContextValue = useMemo(
    (): ChatMessagesContextValue => ({
      threadId,
      messages,
      status: chatStatus,
      isStreaming,
      isAwaitingResponse,
      specsMap,
      savedArtifactKeys,
      submittedFormData,
      handleFormSubmit,
      handleSaveArtifact,
    }),
    [
      threadId,
      messages,
      chatStatus,
      isStreaming,
      isAwaitingResponse,
      specsMap,
      savedArtifactKeys,
      submittedFormData,
      handleFormSubmit,
      handleSaveArtifact,
    ],
  );

  const composerContextValue = useMemo(
    (): ChatComposerContextValue => ({
      input,
      setInput,
      textareaRef,
      handleSubmit,
      status: chatStatus,
    }),
    [input, handleSubmit, chatStatus],
  );

  return (
    <ChatMessagesContext.Provider value={messagesContextValue}>
      <ChatComposerContext.Provider value={composerContextValue}>
        {children}
      </ChatComposerContext.Provider>
    </ChatMessagesContext.Provider>
  );
}

export function useChatMessagesContext(): ChatMessagesContextValue {
  const ctx = useContext(ChatMessagesContext);
  if (!ctx) {
    throw new Error("useChatMessagesContext must be used within a ChatProvider");
  }
  return ctx;
}

export function useChatComposerContext(): ChatComposerContextValue {
  const ctx = useContext(ChatComposerContext);
  if (!ctx) {
    throw new Error("useChatComposerContext must be used within a ChatProvider");
  }
  return ctx;
}

export function ChatMessages() {
  const {
    threadId,
    messages,
    isStreaming,
    isAwaitingResponse,
    specsMap,
    savedArtifactKeys,
    submittedFormData,
    handleFormSubmit,
    handleSaveArtifact,
  } = useChatMessagesContext();

  if (messages.length === 0) {
    return (
      <div className="min-h-0 flex-1">
        <VirtualConversationEmptyState
          icon={<MessageSquare className="size-12" />}
          title="Start a conversation"
          description="Type a message below to begin chatting"
        />
      </div>
    );
  }

  return (
    <VirtualConversation
      threadId={threadId}
      messages={messages as unknown as ChatMessage[]}
      isStreaming={isStreaming}
      isAwaitingResponse={isAwaitingResponse}
      specsMap={specsMap}
      savedArtifactKeys={savedArtifactKeys}
      submittedFormData={submittedFormData}
      onFormSubmit={handleFormSubmit}
      onSaveArtifact={handleSaveArtifact}
    />
  );
}

export function ChatPromptDock() {
  const { status, input, setInput, textareaRef, handleSubmit } =
    useChatComposerContext();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-6">
      <div className="pointer-events-auto mx-auto w-full max-w-4xl">
        <PromptInput onSubmit={handleSubmit}>
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
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
