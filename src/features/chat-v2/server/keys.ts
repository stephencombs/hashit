export function buildV2ChatStreamPath(threadId: string): string {
  return `v2-chat/${threadId}`;
}

export function toV2RunStateKey(threadId: string): string {
  return `v2:${threadId}`;
}
