import { stream } from "@durable-streams/client";
import type { Spec } from "@json-render/core";
import {
  buildReadStreamUrl,
  getDurableReadHeaders,
} from "~/lib/durable-streams";
import { buildV2ChatStreamPath } from "./keys";

type DurableChunk = {
  type?: unknown;
  role?: unknown;
  messageId?: unknown;
  name?: unknown;
  value?: unknown;
};

type UiSpecEventPart = {
  type: "ui-spec";
  spec: Spec;
  specIndex: number;
};

function isSpecCompleteChunk(chunk: DurableChunk): chunk is DurableChunk & {
  type: "CUSTOM";
  name: "spec_complete";
  value: { spec: Spec; specIndex: number };
} {
  if (chunk.type !== "CUSTOM" || chunk.name !== "spec_complete") return false;
  const value = chunk.value as { spec?: unknown; specIndex?: unknown };
  return (
    value &&
    typeof value === "object" &&
    typeof value.specIndex === "number" &&
    value.spec != null &&
    typeof value.spec === "object"
  );
}

export async function readV2UiSpecEventsByMessageId(
  threadId: string,
): Promise<Map<string, Array<UiSpecEventPart>>> {
  const streamPath = buildV2ChatStreamPath(threadId);
  const streamResponse = await stream<DurableChunk>({
    url: buildReadStreamUrl(streamPath),
    headers: getDurableReadHeaders(),
    json: true,
    live: false,
  });
  const chunks = await streamResponse.json<DurableChunk>();
  const byMessageId = new Map<string, Array<UiSpecEventPart>>();
  let activeAssistantMessageId: string | null = null;

  for (const rawChunk of chunks) {
    const chunk = rawChunk ?? {};
    if (chunk.type === "TEXT_MESSAGE_START") {
      const role = chunk.role;
      const messageId = chunk.messageId;
      if (role === "assistant" && typeof messageId === "string") {
        activeAssistantMessageId = messageId;
      } else if (role === "user") {
        activeAssistantMessageId = null;
      }
      continue;
    }

    if (!isSpecCompleteChunk(chunk) || !activeAssistantMessageId) continue;
    const existing = byMessageId.get(activeAssistantMessageId) ?? [];
    existing.push({
      type: "ui-spec",
      spec: chunk.value.spec,
      specIndex: chunk.value.specIndex,
    });
    byMessageId.set(activeAssistantMessageId, existing);
  }

  return byMessageId;
}
