"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "~/shared/ai-elements/message";
import type { PromptInputMessage } from "~/shared/ai-elements/prompt-input";
import { Alert, AlertDescription } from "~/shared/ui/alert";
import { useModelSettings } from "~/shared/hooks/use-model-settings";
import { V2ChatConversation } from "~/features/chat-v2/ui/v2-chat-conversation";
import { V2Composer } from "~/features/chat-v2/ui/v2-composer";
import { confirmPendingV3Thread } from "../data/mutations";
import {
  v3ThreadListQueryOptions,
  v3ThreadSessionQueryOptions,
} from "../data/query-options";

type V3ChatSurfaceProps = {
  threadId: string;
  initialMessages: Array<UIMessage>;
  isDraftThread?: boolean;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Chat request failed";
}

function getMessageFromRole(role: UIMessage["role"]): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function V3ChatSurface({
  threadId,
  initialMessages,
  isDraftThread = false,
  onThreadReady,
}: V3ChatSurfaceProps) {
  const queryClient = useQueryClient();
  const { temperature, systemPrompt } = useModelSettings();
  const [creationError, setCreationError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/v3/chat",
        body: {
          temperature,
          ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
        },
      }),
    [systemPrompt, temperature],
  );

  const { messages, sendMessage, regenerate, status, stop, error, clearError } =
    useChat({
      id: threadId,
      messages: initialMessages,
      transport,
      onError: (chatError) => {
        setRuntimeError(toErrorMessage(chatError));
      },
      onFinish: () => {
        void queryClient.invalidateQueries({
          queryKey: v3ThreadListQueryOptions.queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: v3ThreadSessionQueryOptions(threadId).queryKey,
        });
      },
    });

  const isStreaming = status === "submitted" || status === "streaming";
  const submissionError = creationError ?? runtimeError ?? error?.message;

  const ensureDraftThreadReady = useCallback(async (): Promise<void> => {
    if (!isDraftThread) return;

    setCreationError(null);
    try {
      await confirmPendingV3Thread(queryClient, threadId);
    } catch (createError) {
      setCreationError(toErrorMessage(createError));
      throw createError;
    }
  }, [isDraftThread, queryClient, threadId]);

  const handleComposerSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const trimmedText = message.text.trim();
      if (!trimmedText) return;

      try {
        await ensureDraftThreadReady();
      } catch {
        return;
      }

      setCreationError(null);
      setRuntimeError(null);
      clearError();
      await sendMessage({ text: trimmedText });

      if (isDraftThread) {
        await onThreadReady?.(threadId);
      }
    },
    [
      clearError,
      ensureDraftThreadReady,
      isDraftThread,
      onThreadReady,
      sendMessage,
      threadId,
    ],
  );

  const handleCopyMessage = useCallback((messageId: string, text: string) => {
    if (!text.trim()) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedMessageId(messageId);
        if (copiedResetTimeoutRef.current) {
          clearTimeout(copiedResetTimeoutRef.current);
        }
        copiedResetTimeoutRef.current = setTimeout(() => {
          setCopiedMessageId((current) =>
            current === messageId ? null : current,
          );
          copiedResetTimeoutRef.current = null;
        }, 1_400);
      })
      .catch(() => {});
  }, []);

  const lastAssistantMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === "assistant") return message.id;
    }
    return undefined;
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {submissionError ? (
        <div className="border-b p-3">
          <Alert variant="destructive">
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <V2ChatConversation className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Start the conversation by sending a message.
          </div>
        ) : null}

        {messages.map((message) => {
          const renderText = getMessageText(message);
          const isLatestAssistant = message.id === lastAssistantMessageId;
          return (
            <Message
              key={message.id}
              from={getMessageFromRole(message.role)}
              id={`msg-${message.id}`}
            >
              <MessageContent>
                {renderText.length > 0 ? (
                  <MessageResponse>{renderText}</MessageResponse>
                ) : null}
              </MessageContent>
              <MessageActions>
                <MessageAction
                  label={
                    copiedMessageId === message.id ? "Copied" : "Copy message"
                  }
                  onClick={() => handleCopyMessage(message.id, renderText)}
                  tooltip={
                    copiedMessageId === message.id ? "Copied" : "Copy message"
                  }
                >
                  <span className="relative block size-4">
                    <motion.span
                      animate={{
                        filter:
                          copiedMessageId === message.id
                            ? "blur(4px)"
                            : "blur(0px)",
                        opacity: copiedMessageId === message.id ? 0 : 1,
                        scale: copiedMessageId === message.id ? 0.25 : 1,
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <CopyIcon />
                    </motion.span>
                    <motion.span
                      animate={{
                        filter:
                          copiedMessageId === message.id
                            ? "blur(0px)"
                            : "blur(4px)",
                        opacity: copiedMessageId === message.id ? 1 : 0,
                        scale: copiedMessageId === message.id ? 1 : 0.25,
                      }}
                      className="absolute inset-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <CheckIcon />
                    </motion.span>
                  </span>
                </MessageAction>
                {message.role === "assistant" && isLatestAssistant ? (
                  <MessageAction
                    disabled={isStreaming}
                    label="Regenerate response"
                    onClick={() => {
                      setRuntimeError(null);
                      clearError();
                      void regenerate().catch(() => {});
                    }}
                    tooltip="Regenerate response"
                  >
                    <RotateCcwIcon />
                  </MessageAction>
                ) : null}
              </MessageActions>
            </Message>
          );
        })}
      </V2ChatConversation>

      <V2Composer
        isStreaming={isStreaming}
        onStop={stop}
        onSubmit={handleComposerSubmit}
      />
    </div>
  );
}
