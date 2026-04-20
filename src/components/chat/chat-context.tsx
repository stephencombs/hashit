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
import type { Spec } from "@json-render/core";
import type { UseChatReturn } from "@tanstack/ai-react";
import { MessageSquare } from "lucide-react";

import {
  VirtualConversation,
  VirtualConversationEmptyState,
} from "~/components/chat/virtual-conversation";
import type { ChatMessage } from "~/components/chat/message-row";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputAttachButton,
  PromptInputAttachmentPreviewList,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "~/components/ai-elements/prompt-input";
import { PaperclipIcon, XCircleIcon } from "lucide-react";
import {
  useChatSession,
  type ChatMessageShape,
} from "~/components/chat/use-chat-session";
import { Skeleton } from "~/components/ui/skeleton";

type ChatStatus = UseChatReturn["status"];


function PromptInputSubmitButton({
  input,
  status,
}: {
  input: string;
  status: ChatStatus;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = input.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputSubmit
      disabled={!canSubmit && status === "ready"}
      status={status}
    />
  );
}

/** Conversation + message actions — excludes composer `input` so typing does not re-render the message list. */
interface ChatMessagesContextValue {
  threadId: string | undefined;
  messages: ReturnType<typeof useChatSession>["messages"];
  status: ChatStatus;
  isStreaming: boolean;
  isAwaitingResponse: boolean;
  liveSpecStore: ReturnType<typeof useChatSession>["liveSpecStore"];
  savedArtifactKeys: Set<string>;
  resolveInteractive: ReturnType<typeof useChatSession>["resolveInteractive"];
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
  submissionError: string | null;
  clearSubmissionError: () => void;
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(
  null,
);
const ChatComposerContext = createContext<ChatComposerContextValue | null>(
  null,
);

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const session = useChatSession({
    threadId,
    initialMessages,
    onThreadCreated,
    syncOnRouteThreadChange: true,
  });

  const {
    activeThreadId,
    messages,
    status,
    liveSpecStore,
    savedArtifactKeys,
    resolveInteractive,
    handleSubmit: submitChatMessage,
    handleSaveArtifact,
    isStreaming,
    isAwaitingResponse,
    submissionError,
    clearSubmissionError,
  } = session;

  const prevThreadIdRef = useRef(threadId);
  useLayoutEffect(() => {
    if (prevThreadIdRef.current === threadId) return;
    prevThreadIdRef.current = threadId;
    setInput("");
  }, [threadId]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!message.text.trim() && message.files.length === 0) return;
      await submitChatMessage(message);
      setInput("");
    },
    [submitChatMessage],
  );

  const chatStatus: ChatStatus = status;

  const messagesContextValue = useMemo(
    (): ChatMessagesContextValue => ({
      threadId: activeThreadId,
      messages,
      status: chatStatus,
      isStreaming,
      isAwaitingResponse,
      liveSpecStore,
      savedArtifactKeys,
      resolveInteractive,
      handleSaveArtifact,
    }),
    [
      activeThreadId,
      messages,
      chatStatus,
      isStreaming,
      isAwaitingResponse,
      liveSpecStore,
      savedArtifactKeys,
      resolveInteractive,
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
      submissionError,
      clearSubmissionError,
    }),
    [input, handleSubmit, chatStatus, submissionError, clearSubmissionError],
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

function useDeferredThreadSurface(
  threadId: string | undefined,
  hasMessages: boolean,
): boolean {
  const [readyThreadId, setReadyThreadId] = useState(threadId);

  useEffect(() => {
    if (!hasMessages) {
      setReadyThreadId(threadId);
      return;
    }
    if (readyThreadId === threadId) return;

    let frame = 0;
    frame = requestAnimationFrame(() => {
      setReadyThreadId(threadId);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasMessages, readyThreadId, threadId]);

  if (!hasMessages) return true;
  return readyThreadId === threadId;
}

function DeferredThreadSwitchFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end">
      <div className="space-y-8 px-4 pt-4 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="ml-auto h-11 w-56 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-10/12" />
          <Skeleton className="h-5 w-9/12" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ChatMessages() {
  const {
    threadId,
    messages,
    isStreaming,
    isAwaitingResponse,
    liveSpecStore,
    savedArtifactKeys,
    resolveInteractive,
    handleSaveArtifact,
  } = useChatMessagesContext();
  const hasMessages = messages.length > 0;
  const shouldRenderConversation = useDeferredThreadSurface(
    threadId,
    hasMessages,
  );

  if (!hasMessages) {
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

  if (!shouldRenderConversation) {
    return <DeferredThreadSwitchFallback />;
  }

  return (
    <VirtualConversation
      threadId={threadId}
      messages={messages as unknown as ChatMessage[]}
      isStreaming={isStreaming}
      isAwaitingResponse={isAwaitingResponse}
      liveSpecStore={liveSpecStore}
      savedArtifactKeys={savedArtifactKeys}
      onResolveInteractive={resolveInteractive}
      onSaveArtifact={handleSaveArtifact}
    />
  );
}

export function ChatPromptDock() {
  const {
    status,
    input,
    setInput,
    textareaRef,
    handleSubmit,
    submissionError,
    clearSubmissionError,
  } = useChatComposerContext();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-6">
      <div className="pointer-events-auto mx-auto w-full max-w-4xl">
        {submissionError && (
          <div
            role="alert"
            className="mb-2 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <span className="min-w-0 flex-1">{submissionError}</span>
            <button
              type="button"
              onClick={clearSubmissionError}
              aria-label="Dismiss error"
              className="text-destructive/70 hover:text-destructive"
            >
              <XCircleIcon className="size-4" />
            </button>
          </div>
        )}
        <PromptInput
          onSubmit={handleSubmit}
          accept="image/*,application/pdf"
          globalDrop
          multiple
        >
          <PromptInputBody>
            <PromptInputAttachmentPreviewList />
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputAttachButton>
                <PaperclipIcon className="size-4" />
              </PromptInputAttachButton>
            </PromptInputTools>
            <PromptInputSubmitButton input={input} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
