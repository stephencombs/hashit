import type { ChatMiddleware } from "@tanstack/ai";
import type { RequestLogger } from "evlog";
import { endThreadRun } from "~/lib/server/thread-run-state";

type CreateV2RunLifecycleMiddlewareOptions = {
  runKey: string;
  log?: RequestLogger;
};

export function createV2RunLifecycleMiddleware({
  runKey,
  log,
}: CreateV2RunLifecycleMiddlewareOptions): ChatMiddleware {
  let ended = false;
  const endRun = (): void => {
    if (ended) return;
    ended = true;
    endThreadRun(runKey);
    log?.set({ runLifecycleEnded: true });
  };

  return {
    name: "v2-run-lifecycle",
    onFinish() {
      endRun();
    },
    onAbort() {
      endRun();
    },
    onError() {
      endRun();
    },
  };
}
