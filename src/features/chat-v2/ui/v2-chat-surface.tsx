import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Spec } from "@json-render/core";
import { CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { motion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MessageAction,
  MessageActions,
  Message,
  MessageContent,
  MessageResponse,
} from "~/shared/ai-elements/message";
import type { PromptInputMessage } from "~/shared/ai-elements/prompt-input";
import { Alert, AlertDescription } from "~/shared/ui/alert";
import { Button } from "~/shared/ui/button";
import { DuplicateResolutionDisplay } from "~/shared/ui/duplicate-resolution-display";
import { FormDisplay } from "~/shared/ui/form-display";
import {
  hasCollectFormDataOutput,
  hasResolutionOutput,
  parseV2InteractiveSpec,
  V2InteractiveToolFallback,
  type V2InteractiveToolName,
} from "~/features/chat-v2/ui/v2-interactive-tools";
import { useMcpSettings } from "~/shared/hooks/use-mcp-settings";
import { useModelSettings } from "~/shared/hooks/use-model-settings";
import {
  collectFormDataTool,
  type CollectFormDataOutput,
  type FormSpec,
} from "~/shared/lib/form-tool";
import {
  cancelAllPending,
  registerPending,
  resolvePending,
} from "~/shared/lib/interactive-tool-registry";
import {
  LiveSpecStore,
  useLiveSpecsSnapshot,
} from "~/shared/lib/live-spec-store";
import {
  resolveDuplicateEntityTool,
  type DuplicateResolutionSpec,
  type ResolutionOutput,
} from "~/shared/lib/resolve-duplicate-tool";
import {
  v2ThreadMessagesQueryOptions,
  v2ThreadSessionQueryOptions,
} from "../data/query-options";
import {
  confirmPendingV2Thread,
  discardPendingV2Thread,
  insertPendingV2Thread,
  setV2ThreadTitle,
} from "../data/mutations";
import type { V2RuntimeMessage } from "../types";
import { V2ChatConversation } from "./v2-chat-conversation";
import { V2Composer } from "./v2-composer";

const JsonRenderDisplay = lazy(() =>
  import("~/shared/ui/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

type RuntimeUiSpecPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "ui-spec" }
>;
type RuntimeToolCallPart = Extract<
  V2RuntimeMessage["parts"][number],
  { type: "tool-call" }
>;

export type V2ChatRequestBody = {
  threadId: string;
  source: "v2-chat";
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  selectedServers?: Array<string>;
  enabledTools?: Record<string, Array<string>>;
};

function getMessageFromRole(
  role: V2RuntimeMessage["role"],
): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Chat request failed";
}

function isAbortLikeError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("aborted") ||
    normalized.includes("aborterror") ||
    normalized.includes("request was aborted")
  );
}

function resolveRenderText(message: V2RuntimeMessage): string {
  if (typeof message.renderText === "string") {
    return message.renderText.trim();
  }

  const textParts: string[] = [];
  for (const part of message.parts) {
    if (part.type !== "text") continue;
    textParts.push(part.content);
  }
  return textParts.join("\n").trim();
}

export function mergeBackfilledMessages(params: {
  olderMessages: Array<V2RuntimeMessage>;
  currentMessages: Array<V2RuntimeMessage>;
}): Array<V2RuntimeMessage> {
  const currentIds = new Set(
    params.currentMessages.map((message) => message.id),
  );
  const missingOlder = params.olderMessages.filter(
    (message) => !currentIds.has(message.id),
  );
  if (missingOlder.length === 0) return params.currentMessages;
  return [...missingOlder, ...params.currentMessages];
}

type InitialSnapMode = "aggressive" | "minimal";

export function resolveV2InitialSnapMode(params: {
  isDraftThread: boolean;
  initialMessageCount: number;
  enableInitialTranscriptRender: boolean;
}): InitialSnapMode {
  if (params.isDraftThread) return "aggressive";
  if (params.enableInitialTranscriptRender) return "minimal";
  if (params.initialMessageCount > 0) return "minimal";
  return "aggressive";
}

export function resolveV2TranscriptLayerState(params: {
  enableInitialTranscriptRender: boolean;
  hasInitialTranscriptRenderable: boolean;
  isDraftThread: boolean;
  surfaceReady: boolean;
}): {
  shouldRenderInitialTranscript: boolean;
  shouldShowServerTranscriptLayer: boolean;
  shouldHideClientTranscriptLayer: boolean;
} {
  const shouldRenderInitialTranscript =
    params.enableInitialTranscriptRender &&
    params.hasInitialTranscriptRenderable &&
    !params.isDraftThread;
  const shouldShowServerTranscriptLayer =
    shouldRenderInitialTranscript && !params.surfaceReady;

  return {
    shouldRenderInitialTranscript,
    shouldShowServerTranscriptLayer,
    shouldHideClientTranscriptLayer: shouldShowServerTranscriptLayer,
  };
}

export function hasV2ComposerPayload(message: PromptInputMessage): boolean {
  return message.text.trim().length > 0;
}

export function buildV2ChatRequestBody(input: {
  threadId: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  selectedServers: Array<string>;
  enabledTools: Record<string, Array<string>>;
}): V2ChatRequestBody {
  const selectedServers = input.selectedServers
    .map((server) => server.trim())
    .filter(Boolean);
  return {
    threadId: input.threadId,
    source: "v2-chat",
    ...(input.model.trim() ? { model: input.model.trim() } : {}),
    ...(Number.isFinite(input.temperature)
      ? { temperature: input.temperature }
      : {}),
    ...(input.systemPrompt.trim()
      ? { systemPrompt: input.systemPrompt.trim() }
      : {}),
    ...(selectedServers.length > 0 ? { selectedServers } : {}),
    ...(selectedServers.length > 0 ? { enabledTools: input.enabledTools } : {}),
  };
}

function V2InteractiveToolPart({
  part,
  messageComplete,
  onApprovalResponse,
  onResolve,
}: {
  part: RuntimeToolCallPart;
  messageComplete: boolean;
  onApprovalResponse: (approvalId: string, approved: boolean) => void;
  onResolve: (toolName: V2InteractiveToolName, output: unknown) => void;
}) {
  if (part.approval?.needsApproval && part.approval.approved == null) {
    return (
      <div className="border-border/70 bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Approve tool call?</p>
          <p className="text-muted-foreground text-xs">
            {part.name} is waiting for permission before it runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            type="button"
            onClick={() => onApprovalResponse(part.approval!.id, true)}
          >
            Approve
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onApprovalResponse(part.approval!.id, false)}
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }

  if (part.name === "collect_form_data") {
    const formSpec = parseV2InteractiveSpec<FormSpec>(part.arguments);
    if (!formSpec) {
      return messageComplete ? (
        <V2InteractiveToolFallback message="Unable to render form request." />
      ) : null;
    }

    const isSubmitted = hasCollectFormDataOutput(part.output);
    if (part.output !== undefined && !isSubmitted) return null;

    return (
      <FormDisplay
        spec={formSpec}
        disabled={isSubmitted}
        submittedData={isSubmitted ? part.output.data : undefined}
        draftStorageKey={`v2:collect_form_data:${part.id}`}
        onSubmit={
          isSubmitted
            ? undefined
            : (data) =>
                onResolve("collect_form_data", {
                  data: data as Record<string, string | number | boolean>,
                })
        }
      />
    );
  }

  if (part.name === "resolve_duplicate_entity") {
    const duplicateSpec = parseV2InteractiveSpec<DuplicateResolutionSpec>(
      part.arguments,
    );
    if (!duplicateSpec) {
      return messageComplete ? (
        <V2InteractiveToolFallback message="Unable to render duplicate-resolution request." />
      ) : null;
    }

    const isResolved = hasResolutionOutput(part.output);
    if (part.output !== undefined && !isResolved) return null;

    return (
      <DuplicateResolutionDisplay
        spec={duplicateSpec}
        disabled={isResolved}
        submittedData={
          isResolved ? (part.output as Record<string, unknown>) : undefined
        }
        onResolve={
          isResolved
            ? undefined
            : (output: ResolutionOutput) =>
                onResolve("resolve_duplicate_entity", output)
        }
      />
    );
  }

  return null;
}

type V2ChatSurfaceProps = {
  threadId: string;
  initialResumeOffset?: string;
  initialMessages: Array<V2RuntimeMessage>;
  isDraftThread?: boolean;
  onThreadReady?: (threadId: string) => Promise<void> | void;
};

export function V2ChatSurface({
  threadId,
  initialResumeOffset,
  initialMessages,
  isDraftThread = false,
  onThreadReady,
}: V2ChatSurfaceProps) {
  const queryClient = useQueryClient();
  const { model, temperature, systemPrompt } = useModelSettings();
  const { selectedServers, enabledTools } = useMcpSettings();
  const [creationError, setCreationError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const suppressAbortErrorRef = useRef(false);
  const suppressAbortResetTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [liveSpecStore] = useState(() => new LiveSpecStore());
  const liveSpecsByMessageId = useLiveSpecsSnapshot(liveSpecStore);

  const connection = useMemo(() => {
    const encodedThreadId = encodeURIComponent(threadId);
    return durableStreamConnection({
      sendUrl: `/api/v2/chat?id=${encodedThreadId}`,
      readUrl: `/api/v2/chat-stream?id=${encodedThreadId}`,
      initialOffset: initialResumeOffset,
    });
  }, [initialResumeOffset, threadId]);

  const requestBody = useMemo(
    () =>
      buildV2ChatRequestBody({
        threadId,
        model,
        temperature,
        systemPrompt,
        selectedServers,
        enabledTools,
      }),
    [enabledTools, model, selectedServers, systemPrompt, temperature, threadId],
  );

  const clientTools = useMemo(() => {
    const collectFormData = collectFormDataTool.client(async () =>
      registerPending<CollectFormDataOutput>("collect_form_data"),
    );
    const resolveDuplicate = resolveDuplicateEntityTool.client(async () =>
      registerPending<ResolutionOutput>("resolve_duplicate_entity"),
    );
    return [collectFormData, resolveDuplicate] as const;
  }, []);

  const {
    messages: runtimeMessages,
    sendMessage,
    reload,
    status,
    stop,
    setMessages,
    addToolApprovalResponse,
  } = useChat({
    id: threadId,
    connection,
    live: true,
    tools: clientTools,
    // useChat's default part union does not include V2 custom ui-spec parts.
    initialMessages: initialMessages as never,
    body: requestBody,
    onCustomEvent: (eventType: string, data: unknown) => {
      if (eventType === "thread_title_updated") {
        const payload = data as { threadId?: string; title?: string };
        if (payload.threadId && typeof payload.title === "string") {
          setV2ThreadTitle(queryClient, payload.threadId, payload.title);
        }
      }

      if (eventType === "persistence_complete") {
        void queryClient.invalidateQueries({
          queryKey: v2ThreadSessionQueryOptions(threadId).queryKey,
          exact: true,
        });
        void queryClient.invalidateQueries({
          queryKey: v2ThreadMessagesQueryOptions(threadId).queryKey,
          exact: true,
        });
      }
      if (eventType === "spec_patch" || eventType === "spec_complete") {
        const payload = data as { spec?: unknown; specIndex?: unknown };
        if (
          typeof payload.specIndex !== "number" ||
          payload.spec == null ||
          typeof payload.spec !== "object"
        ) {
          return;
        }
        const latestAssistant = [...runtimeMessagesRef.current]
          .reverse()
          .find((message) => message.role === "assistant");
        if (!latestAssistant) return;
        liveSpecStore.set(
          latestAssistant.id,
          payload.specIndex,
          payload.spec as unknown as Spec,
        );
      }
    },
    onError: (chatError: unknown) => {
      const message = toErrorMessage(chatError);
      if (isAbortLikeError(message)) {
        if (suppressAbortErrorRef.current) {
          suppressAbortErrorRef.current = false;
        }
        return;
      }
      suppressAbortErrorRef.current = false;
      setRuntimeError(message);
    },
  });
  const previousThreadIdRef = useRef(threadId);
  const runtimeMessagesRef = useRef<Array<V2RuntimeMessage>>(initialMessages);

  useEffect(() => {
    runtimeMessagesRef.current = runtimeMessages as Array<V2RuntimeMessage>;
  }, [runtimeMessages]);

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) return;
    previousThreadIdRef.current = threadId;

    // Keep the runtime aligned with Router thread identity changes.
    suppressAbortErrorRef.current = true;
    if (suppressAbortResetTimeoutRef.current) {
      clearTimeout(suppressAbortResetTimeoutRef.current);
    }
    suppressAbortResetTimeoutRef.current = setTimeout(() => {
      suppressAbortErrorRef.current = false;
      suppressAbortResetTimeoutRef.current = null;
    }, 2_000);
    cancelAllPending("thread changed");
    stop();
    setMessages(initialMessages as never);
    liveSpecStore.clear();
    setCopiedMessageId(null);
    setCreationError(null);
    setRuntimeError(null);
  }, [initialMessages, liveSpecStore, setMessages, stop, threadId]);

  useEffect(() => {
    return () => {
      cancelAllPending("surface unmounted");
      if (suppressAbortResetTimeoutRef.current) {
        clearTimeout(suppressAbortResetTimeoutRef.current);
      }
      if (copiedResetTimeoutRef.current) {
        clearTimeout(copiedResetTimeoutRef.current);
      }
    };
  }, []);

  const displayMessages = runtimeMessages as Array<V2RuntimeMessage>;
  const isStreaming = status === "submitted" || status === "streaming";
  const submissionError = creationError ?? runtimeError;
  const renderedMessages = useMemo(() => {
    let lastAssistantMessageId: string | undefined;
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const message = displayMessages[i];
      if (message.role === "assistant") {
        lastAssistantMessageId = message.id;
        break;
      }
    }

    return displayMessages.map((message) => {
      const persistedSpecs = message.parts
        .filter((part): part is RuntimeUiSpecPart => part.type === "ui-spec")
        .sort((left, right) => left.specIndex - right.specIndex);
      const liveSpecs = liveSpecsByMessageId.get(message.id);
      return {
        isLatestAssistant: message.id === lastAssistantMessageId,
        liveSpecs,
        message,
        persistedSpecs,
        renderText: resolveRenderText(message),
        shouldShowLiveSpecs: persistedSpecs.length === 0 && Boolean(liveSpecs),
      };
    });
  }, [displayMessages, liveSpecsByMessageId]);

  const ensureDraftThreadReady = useCallback(async (): Promise<void> => {
    if (!isDraftThread) return;

    setCreationError(null);
    insertPendingV2Thread(queryClient, threadId);

    try {
      await confirmPendingV2Thread(queryClient, threadId);
      await onThreadReady?.(threadId);
    } catch (error) {
      discardPendingV2Thread(queryClient, threadId);
      setCreationError((error as Error).message);
      throw error;
    }
  }, [isDraftThread, onThreadReady, queryClient, threadId]);

  const handleComposerSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!hasV2ComposerPayload(message)) return;
      const trimmedText = message.text.trim();

      try {
        await ensureDraftThreadReady();
      } catch {
        return;
      }

      setCreationError(null);
      setRuntimeError(null);
      await sendMessage(trimmedText);
    },
    [ensureDraftThreadReady, sendMessage],
  );

  const handleResolveInteractive = useCallback(
    (toolName: V2InteractiveToolName, output: unknown) => {
      if (resolvePending(toolName, output)) {
        setRuntimeError(null);
        return;
      }
      setRuntimeError("Interactive tool is no longer waiting for input.");
    },
    [],
  );

  const handleToolApprovalResponse = useCallback(
    (approvalId: string, approved: boolean) => {
      void addToolApprovalResponse({ id: approvalId, approved }).catch(
        (error) => {
          setRuntimeError(toErrorMessage(error));
        },
      );
    },
    [addToolApprovalResponse],
  );

  const handleStop = useCallback(() => {
    cancelAllPending("stopped");
    stop();
  }, [stop]);

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
        {renderedMessages.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Start the conversation by sending a message.
          </div>
        ) : null}

        {renderedMessages.map(
          ({
            isLatestAssistant,
            liveSpecs,
            message,
            persistedSpecs,
            renderText,
            shouldShowLiveSpecs,
          }) => (
            <Message
              key={message.id}
              from={getMessageFromRole(message.role)}
              id={`msg-${message.id}`}
            >
              <MessageContent>
                {renderText.length > 0 ? (
                  <MessageResponse>{renderText}</MessageResponse>
                ) : null}
                {message.parts.map((part, index) =>
                  part.type === "tool-call" ? (
                    <V2InteractiveToolPart
                      key={`${message.id}:tool:${part.id}:${index}`}
                      part={part}
                      messageComplete={!isStreaming || !isLatestAssistant}
                      onApprovalResponse={handleToolApprovalResponse}
                      onResolve={handleResolveInteractive}
                    />
                  ) : null,
                )}
                {persistedSpecs.map((part) => (
                  <Suspense
                    key={`${message.id}:persisted:${part.specIndex}`}
                    fallback={null}
                  >
                    <JsonRenderDisplay
                      spec={part.spec as Spec}
                      isStreaming={false}
                      messageId={message.id}
                      specIndex={part.specIndex}
                    />
                  </Suspense>
                ))}
                {shouldShowLiveSpecs
                  ? liveSpecs?.map((spec, index) => (
                      <Suspense
                        key={`${message.id}:live:${index}`}
                        fallback={null}
                      >
                        <JsonRenderDisplay
                          spec={spec}
                          isStreaming={isStreaming && isLatestAssistant}
                          messageId={message.id}
                          specIndex={index}
                        />
                      </Suspense>
                    ))
                  : null}
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
                      void reload().catch(() => {});
                    }}
                    tooltip="Regenerate response"
                  >
                    <RotateCcwIcon />
                  </MessageAction>
                ) : null}
              </MessageActions>
            </Message>
          ),
        )}
      </V2ChatConversation>

      <V2Composer
        isStreaming={isStreaming}
        onStop={handleStop}
        onSubmit={handleComposerSubmit}
      />
    </div>
  );
}
