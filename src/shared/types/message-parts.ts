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

// Tool-call part extended with a pre-computed label suffix so persistence and
// display code can avoid reparsing raw tool arguments.
export interface AppToolCallPart extends Omit<ToolCallPart, never> {
  argsPreview?: string;
}

// Tool-result part extended with a pre-computed display summary for persisted
// activity rows.
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

export type { MessagePart, ToolCallPart };
