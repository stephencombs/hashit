import type { AppMessagePart } from "~/features/chat-v1/ui/message-row.types";

export type ChatMessageShape = {
  id: string;
  role: "user" | "assistant";
  parts: Array<AppMessagePart>;
};

export interface UseChatControllerOptions {
  threadId?: string;
  initialMessages?: Array<ChatMessageShape>;
  initialResumeOffset?: string;
  onThreadCreated?: (threadId: string) => void;
  cancelQueriesOnUnmount?: boolean;
  syncOnRouteThreadChange?: boolean;
}
