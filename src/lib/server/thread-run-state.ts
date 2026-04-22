const activeRunsByThreadId = new Map<string, number>();

export function beginThreadRun(threadId: string): void {
  const current = activeRunsByThreadId.get(threadId) ?? 0;
  activeRunsByThreadId.set(threadId, current + 1);
}

export function endThreadRun(threadId: string): void {
  const current = activeRunsByThreadId.get(threadId);
  if (!current) return;
  if (current <= 1) {
    activeRunsByThreadId.delete(threadId);
    return;
  }
  activeRunsByThreadId.set(threadId, current - 1);
}

export function isThreadRunActive(threadId: string): boolean {
  return (activeRunsByThreadId.get(threadId) ?? 0) > 0;
}
