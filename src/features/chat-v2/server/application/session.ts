import {
  isDurableStreamsConfigured,
  readDurableStreamHeadOffset,
} from "~/shared/lib/durable-streams";
import type { V2ThreadSession } from "../../types";
import { getV2ThreadByIdRepository } from "../repositories/threads";
import { buildV2ChatStreamPath } from "../streams/paths";

export async function getV2ThreadSessionServer(
  threadId: string,
): Promise<V2ThreadSession> {
  const thread = await getV2ThreadByIdRepository(threadId);

  let initialResumeOffset: string | undefined =
    thread.resumeOffset ?? undefined;
  if (!initialResumeOffset && isDurableStreamsConfigured()) {
    try {
      initialResumeOffset = await readDurableStreamHeadOffset(
        buildV2ChatStreamPath(threadId),
      );
    } catch {
      // Continue without a durable offset fallback.
    }
  }

  return {
    thread,
    initialResumeOffset,
  };
}
