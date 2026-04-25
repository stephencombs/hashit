import { ensureDurableChatSessionStream } from "@durable-streams/tanstack-ai-transport";
import {
  getDurableChatSessionTarget,
  isDurableStreamsConfigured,
} from "~/shared/lib/durable-streams";
import type { V2Thread } from "../../types";
import {
  createV2ThreadRepository,
  deleteV2ThreadRepository,
  getV2ThreadByIdRepository,
  listV2ThreadsRepository,
  setV2ThreadPinnedRepository,
  setV2ThreadTitleRepository,
  type CreateV2ThreadInput,
  type SetV2ThreadPinnedInput,
  type SetV2ThreadTitleInput,
} from "../repositories/threads";
import { buildV2ChatStreamPath } from "../streams/paths";

export async function listV2ThreadsServer(): Promise<Array<V2Thread>> {
  return listV2ThreadsRepository();
}

export async function getV2ThreadByIdServer(
  threadId: string,
): Promise<V2Thread> {
  return getV2ThreadByIdRepository(threadId);
}

export async function createV2ThreadServer(
  input: CreateV2ThreadInput,
): Promise<V2Thread> {
  const thread = await createV2ThreadRepository(input);

  if (isDurableStreamsConfigured()) {
    try {
      await ensureDurableChatSessionStream(
        getDurableChatSessionTarget(buildV2ChatStreamPath(thread.id)),
      );
    } catch {
      // Stream creation is best-effort during thread bootstrap.
    }
  }

  return thread;
}

export async function setV2ThreadPinnedServer(
  input: SetV2ThreadPinnedInput,
): Promise<V2Thread> {
  return setV2ThreadPinnedRepository(input);
}

export async function setV2ThreadTitleServer(
  input: SetV2ThreadTitleInput,
): Promise<V2Thread> {
  return setV2ThreadTitleRepository(input);
}

export async function deleteV2ThreadServer(threadId: string): Promise<void> {
  return deleteV2ThreadRepository(threadId);
}
