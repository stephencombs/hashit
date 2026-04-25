import type { ChatMiddleware } from "@tanstack/ai";
import { endV2ThreadRun } from "./thread-run-state.server";

type CreateV2RunLifecycleMiddlewareOptions = {
  threadId: string;
};

export type V2RunLifecycleController = {
  end: () => Promise<void>;
  hasEnded: () => boolean;
};

export function createV2RunLifecycleController({
  threadId,
}: CreateV2RunLifecycleMiddlewareOptions): V2RunLifecycleController {
  let ended = false;
  return {
    async end() {
      if (ended) return;
      ended = true;
      await endV2ThreadRun(threadId);
    },
    hasEnded() {
      return ended;
    },
  };
}

export function createV2RunLifecycleMiddleware(
  controllerOrOptions:
    | V2RunLifecycleController
    | CreateV2RunLifecycleMiddlewareOptions,
): ChatMiddleware {
  const controller =
    "end" in controllerOrOptions
      ? controllerOrOptions
      : createV2RunLifecycleController(controllerOrOptions);
  const endRun = async (): Promise<void> => {
    await controller.end();
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
