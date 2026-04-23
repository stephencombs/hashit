import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  createV2ThreadServer,
  deleteV2ThreadServer,
  listV2ThreadsServer,
  setV2ThreadPinnedServer,
  setV2ThreadTitleServer,
} from "./threads.server";

const createV2ThreadInputSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  title: z.string().trim().max(200).optional(),
});

const setV2ThreadPinnedInputSchema = z.object({
  threadId: z.string().min(1).max(128),
  pinned: z.boolean(),
});

const setV2ThreadTitleInputSchema = z.object({
  threadId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(200),
});

const deleteV2ThreadInputSchema = z.object({
  threadId: z.string().min(1).max(128),
});

export const listV2Threads = createServerFn({ method: "GET" }).handler(
  async () => listV2ThreadsServer(),
);

export const createV2Thread = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createV2ThreadInputSchema))
  .handler(async ({ data }) => createV2ThreadServer(data));

export const setV2ThreadPinned = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(setV2ThreadPinnedInputSchema))
  .handler(async ({ data }) => setV2ThreadPinnedServer(data));

export const setV2ThreadTitle = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(setV2ThreadTitleInputSchema))
  .handler(async ({ data }) => setV2ThreadTitleServer(data));

export const deleteV2Thread = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(deleteV2ThreadInputSchema))
  .handler(async ({ data }) => deleteV2ThreadServer(data.threadId));
