import type { Spec } from "@json-render/core";
import type {
  AudioPart,
  DocumentPart,
  ImagePart,
  MessagePart,
  TextPart,
  ThinkingPart,
  ToolCallPart,
  VideoPart,
} from "@tanstack/ai";

// Tool-call part extended with a pre-computed label suffix so the client never
// needs to JSON.parse `arguments` just to build a display label.
export interface AppToolCallPart extends Omit<ToolCallPart, never> {
  argsPreview?: string;
}

// Tool-result part extended with a pre-computed display summary so the client
// never needs to JSON.parse `content` for the activity-row label.
export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  state: string;
  content?: string;
  summary?: string;
}

export interface UiSpecPart {
  type: "ui-spec";
  spec: Spec;
  specIndex: number;
}

export interface ToolSummaryPart {
  type: "tool-summary";
  content: string;
}

// The project-local MessagePart union that extends @tanstack/ai's MessagePart
// with app-specific part kinds and enriched fields. Use this everywhere instead
// of importing MessagePart directly.
export type AppMessagePart =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | AppToolCallPart
  | ToolResultPart
  | ThinkingPart
  | UiSpecPart
  | ToolSummaryPart;

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

// Re-export ToolCallPart for code that specifically needs the library type.
export type { MessagePart, ToolCallPart };
