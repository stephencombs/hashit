import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "~/shared/ai-elements/message";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "~/shared/ai-elements/attachments";
import { DuplicateResolutionDisplay } from "~/shared/ui/duplicate-resolution-display";
import { FormDisplay } from "~/shared/ui/form-display";
import { MessageRowActivity } from "~/features/chat-v1/ui/message-row-activity";
import {
  InteractiveToolFallback,
  isRenderableAttachmentPart,
  toAttachmentData,
} from "~/features/chat-v1/ui/message-row-parts";
import type {
  ChatMessage,
  MessageRowProps,
} from "~/features/chat-v1/ui/message-row.types";
import { useMessageRowData } from "~/features/chat-v1/ui/use-message-row-data";
import {
  hasCollectFormDataOutput,
  hasResolutionOutput,
  parseInteractiveSpec,
} from "~/features/chat-v1/ui/message-row-utils";
import type { FormSpec } from "~/shared/lib/form-tool";
import type {
  DuplicateResolutionSpec,
  ResolutionOutput,
} from "~/shared/lib/resolve-duplicate-tool";

const JsonRenderDisplay = lazy(() =>
  import("~/shared/ui/json-render-display").then((module) => ({
    default: module.JsonRenderDisplay,
  })),
);

type ChatAttachmentPart = Extract<
  ChatMessage["parts"][number],
  { type: "image" | "audio" | "video" | "document" }
>;

function SpecMountReporter({
  onReady,
  children,
}: {
  onReady: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return <>{children}</>;
}

function BottomSpecPendingTracker({
  specKey,
  onPendingChange,
  children,
}: {
  specKey: string;
  onPendingChange: ((specKey: string, pending: boolean) => void) | undefined;
  children: (onReady: () => void) => ReactNode;
}) {
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = false;
    onPendingChange?.(specKey, true);
    return () => {
      onPendingChange?.(specKey, false);
    };
  }, [onPendingChange, specKey]);

  const markReady = useCallback(() => {
    if (!onPendingChange || readyRef.current) return;
    readyRef.current = true;
    onPendingChange(specKey, false);
  }, [onPendingChange, specKey]);

  return <>{children(markReady)}</>;
}

function MessageRowImpl({
  message,
  isLastMessage,
  isStreaming,
  liveSpecs,
  savedArtifactKeys,
  onResolveInteractive,
  onBottomSpecPendingChange,
  onSaveArtifact,
}: MessageRowProps) {
  const messageComplete = !isStreaming || !isLastMessage;
  const {
    lastInteractiveToolCallIndexById,
    steps,
    persistedSpecs,
    toolSummary,
  } = useMessageRowData({
    parts: message.parts,
    messageComplete,
  });
  const attachments = message.parts
    .map((part, index) => ({ part, index }))
    .filter(
      (
        item,
      ): item is {
        part: ChatAttachmentPart;
        index: number;
      } => isRenderableAttachmentPart(item.part),
    )
    .map(
      ({ part, index }): AttachmentData =>
        toAttachmentData(part, `${message.id}:attachment:${index}`),
    );
  const attachmentsNode =
    attachments.length > 0 ? (
      <Attachments variant="grid" className="group-[.is-user]:ml-auto">
        {attachments.map((attachment) => (
          <Attachment key={attachment.id} data={attachment}>
            <AttachmentPreview />
            <AttachmentInfo />
          </Attachment>
        ))}
      </Attachments>
    ) : null;

  return (
    <Message
      from={message.role as "user" | "assistant"}
      key={message.id}
      id={`msg-${message.id}`}
    >
      {message.role === "user" ? attachmentsNode : null}
      <MessageContent>
        {steps.length > 0 && (
          <MessageRowActivity
            steps={steps}
            isStreaming={isStreaming}
            toolSummaryContent={toolSummary?.content}
          />
        )}
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
              return null;
            case "audio":
              return null;
            case "video":
              return null;
            case "document":
              return null;
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

              if (part.name === "collect_form_data") {
                const formSpec = parseInteractiveSpec<FormSpec>(part.arguments);
                if (!formSpec) {
                  return messageComplete ? (
                    <InteractiveToolFallback
                      key={key}
                      message="Unable to render form request."
                    />
                  ) : null;
                }

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
                const submittedOutput = isFormSubmitted
                  ? part.output
                  : undefined;
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
                const dupSpec = parseInteractiveSpec<DuplicateResolutionSpec>(
                  part.arguments,
                );
                if (!dupSpec) {
                  return messageComplete ? (
                    <InteractiveToolFallback
                      key={key}
                      message="Unable to render duplicate-resolution request."
                    />
                  ) : null;
                }

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
            case "ui-spec":
              // Rendered by the persisted/live spec sections below.
              return null;
            case "tool-summary":
              // Rendered by MessageRowActivity via toolSummary extraction.
              return null;
            default: {
              // The strict `never` check below catches future MessagePart
              // additions at compile time so we can decide how to render them.
              const _exhaustive: never = part;
              void _exhaustive;
              return null;
            }
          }
        })}
        {message.role !== "user" ? attachmentsNode : null}
      </MessageContent>
      {persistedSpecs.length > 0
        ? persistedSpecs.map(({ spec, idx }) => (
            <BottomSpecPendingTracker
              key={`persisted-${idx}`}
              specKey={`persisted:${message.id}:${idx}`}
              onPendingChange={
                isLastMessage ? onBottomSpecPendingChange : undefined
              }
            >
              {(markReady) => (
                <Suspense fallback={null}>
                  <SpecMountReporter onReady={markReady}>
                    <JsonRenderDisplay
                      spec={spec}
                      isStreaming={false}
                      messageId={message.id}
                      specIndex={idx}
                      saved={savedArtifactKeys.has(`${message.id}:${idx}`)}
                      onSaveArtifact={onSaveArtifact}
                    />
                  </SpecMountReporter>
                </Suspense>
              )}
            </BottomSpecPendingTracker>
          ))
        : liveSpecs && liveSpecs.length > 0
          ? liveSpecs.map((spec, idx) => (
              <BottomSpecPendingTracker
                key={`live-${idx}`}
                specKey={`live:${message.id}:${idx}`}
                onPendingChange={
                  isLastMessage ? onBottomSpecPendingChange : undefined
                }
              >
                {(markReady) => (
                  <Suspense fallback={null}>
                    <SpecMountReporter onReady={markReady}>
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
                    </SpecMountReporter>
                  </Suspense>
                )}
              </BottomSpecPendingTracker>
            ))
          : null}
    </Message>
  );
}

export const MessageRow = memo(MessageRowImpl);
export type { ChatMessage };
