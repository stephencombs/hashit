import type { Spec } from "@json-render/core";
import type {
  AppMessagePart,
  AppToolCallPart,
} from "~/shared/types/message-parts";
export type {
  AppMessagePart,
  AppToolCallPart,
  MessagePart,
  ToolCallPart,
  ToolResultPart,
  ToolSummaryPart,
  UiSpecPart,
} from "~/shared/types/message-parts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<AppMessagePart>;
}

export type InteractiveToolName =
  | "collect_form_data"
  | "resolve_duplicate_entity";

export interface MessageRowProps {
  message: ChatMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  liveSpecs: Spec[] | undefined;
  savedArtifactKeys: Set<string>;
  onBottomSpecPendingChange?: (specKey: string, pending: boolean) => void;
  onResolveInteractive: (
    toolName: InteractiveToolName,
    output: unknown,
  ) => void;
  onSaveArtifact: (spec: Spec, messageId?: string, specIndex?: number) => void;
}

export type ActivityStep =
  | { kind: "thinking"; text: string; isStreaming: boolean }
  | {
      kind: "tool";
      tc: AppToolCallPart;
      done: boolean;
      resultContent?: string;
      summary?: string;
    };
