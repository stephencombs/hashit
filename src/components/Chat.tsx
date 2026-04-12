import { useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
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
  PromptInput,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputBody,
} from "~/components/ai-elements/prompt-input";
import { MessageSquare } from "lucide-react";
import type { ChatStatus } from "ai";
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

const OPTIMISTIC_ID = "optimistic-new";

export function Chat({
  threadId,
  initialMessages,
  onThreadCreated,
}: ChatProps) {
  const [input, setInput] = useState("");
  const createdThreadIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    connection: fetchServerSentEvents("/api/chat"),
    initialMessages: initialMessages as any,
    body: threadId ? { threadId } : undefined,
    onCustomEvent: (eventType: string, data: unknown, _context: { toolCallId?: string }) => {
      if (eventType === "thread_created") {
        const realId = (data as { threadId: string }).threadId;
        createdThreadIdRef.current = realId;

        queryClient.setQueryData<Thread[]>(["threads"], (old = []) =>
          old.map((t) => (t.id === OPTIMISTIC_ID ? { ...t, id: realId } : t)),
        );
      }
    },
    onFinish: () => {
      if (!threadId && createdThreadIdRef.current && onThreadCreated) {
        queryClient.invalidateQueries({ queryKey: ["threads"] });
        onThreadCreated(createdThreadIdRef.current);
        createdThreadIdRef.current = null;
      }
    },
  });

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim()) return;

    if (!threadId) {
      const now = new Date();
      queryClient.setQueryData<Thread[]>(["threads"], (old = []) => [
        { id: OPTIMISTIC_ID, title: "Untitled", createdAt: now, updatedAt: now },
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
            messages.map((message) => (
              <Message
                from={message.role as "user" | "assistant"}
                key={message.id}
              >
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${message.id}-${i}`}>
                          {part.content}
                        </MessageResponse>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
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
