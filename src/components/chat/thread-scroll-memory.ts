const memory = new Map<string, number>();

export const threadScrollMemory = {
  get(threadId: string | undefined): number | undefined {
    if (!threadId) return undefined;
    return memory.get(threadId);
  },
  set(threadId: string | undefined, offset: number): void {
    if (!threadId) return;
    memory.set(threadId, offset);
  },
  delete(threadId: string | undefined): void {
    if (!threadId) return;
    memory.delete(threadId);
  },
};
