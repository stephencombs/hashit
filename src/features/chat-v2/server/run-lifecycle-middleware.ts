import type { ChatMiddleware } from "@tanstack/ai";
import type { RequestLogger } from "evlog";
import { endV2ThreadRun } from "./thread-run-state.server";

type CreateV2RunLifecycleMiddlewareOptions = {
  threadId: string;
  log?: RequestLogger;
};

export function createV2RunLifecycleMiddleware({
  threadId,
  log,
}: CreateV2RunLifecycleMiddlewareOptions): ChatMiddleware {
  let ended = false;
  const endRun = async (): Promise<void> => {
    if (ended) return;
    ended = true;
    await endV2ThreadRun(threadId);
    log?.set({ runLifecycleEnded: true });
  };

  return {
    name: "v2-run-lifecycle",
    async onFinish() {
      await endRun();
    },
    async onAbort() {
      await endRun();
    },
    async onError() {
      await endRun();
    },
  };
}
