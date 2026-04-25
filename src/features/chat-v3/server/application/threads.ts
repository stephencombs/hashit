import type { UIMessage } from "ai";
import type { V3Thread, V3ThreadSummary } from "../../types";
import {
  createV3ThreadRepository,
  deleteV3ThreadRepository,
  getV3ThreadByIdOrNullRepository,
  getV3ThreadByIdRepository,
  listV3ThreadsRepository,
  saveV3ThreadMessagesRepository,
  setV3ThreadPinnedRepository,
  setV3ThreadTitleRepository,
  type CreateV3ThreadInput,
  type SetV3ThreadPinnedInput,
  type SetV3ThreadTitleInput,
} from "../repositories/threads";

export async function listV3ThreadsServer(): Promise<Array<V3ThreadSummary>> {
  return listV3ThreadsRepository();
}

export async function getV3ThreadByIdServer(
  threadId: string,
): Promise<V3Thread> {
  return getV3ThreadByIdRepository(threadId);
}

export async function getV3ThreadSessionServer(
  threadId: string,
): Promise<V3Thread> {
  return getV3ThreadByIdRepository(threadId);
}

export async function ensureV3ThreadServer(
  input: CreateV3ThreadInput,
): Promise<V3Thread> {
  if (input.id) {
    const existing = await getV3ThreadByIdOrNullRepository(input.id);
    if (existing) return existing;
  }

  return createV3ThreadRepository(input);
}

export async function createV3ThreadServer(
  input: CreateV3ThreadInput,
): Promise<V3Thread> {
  return ensureV3ThreadServer(input);
}

export async function saveV3ThreadMessagesServer(input: {
  threadId: string;
  messages: Array<UIMessage>;
  title?: string;
}): Promise<V3Thread> {
  return saveV3ThreadMessagesRepository(input);
}

export async function setV3ThreadPinnedServer(
  input: SetV3ThreadPinnedInput,
): Promise<V3Thread> {
  return setV3ThreadPinnedRepository(input);
}

export async function setV3ThreadTitleServer(
  input: SetV3ThreadTitleInput,
): Promise<V3Thread> {
  return setV3ThreadTitleRepository(input);
}

export async function deleteV3ThreadServer(threadId: string): Promise<void> {
  return deleteV3ThreadRepository(threadId);
}
