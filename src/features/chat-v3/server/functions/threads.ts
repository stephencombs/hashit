import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  createV3ThreadServer,
  deleteV3ThreadServer,
  getV3ThreadSessionServer,
  listV3ThreadsServer,
  setV3ThreadPinnedServer,
  setV3ThreadTitleServer,
} from "../application/threads";

const v3ThreadIdSchema = z.string().min(1).max(128);

const createV3ThreadInputSchema = z.object({
  id: v3ThreadIdSchema.optional(),
  title: z.string().trim().max(200).optional(),
});

const setV3ThreadPinnedInputSchema = z.object({
  threadId: v3ThreadIdSchema,
  pinned: z.boolean(),
});

const setV3ThreadTitleInputSchema = z.object({
  threadId: v3ThreadIdSchema,
  title: z.string().trim().min(1).max(200),
});

const deleteV3ThreadInputSchema = z.object({
  threadId: v3ThreadIdSchema,
});

export const listV3Threads = createServerFn({ method: "GET" }).handler(
  async () => listV3ThreadsServer(),
);

export const createV3Thread = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createV3ThreadInputSchema))
  .handler(async ({ data }) => createV3ThreadServer(data));

export const getV3ThreadSession = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v3ThreadIdSchema))
  .handler(async ({ data }) => getV3ThreadSessionServer(data));

export const setV3ThreadPinned = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(setV3ThreadPinnedInputSchema))
  .handler(async ({ data }) => setV3ThreadPinnedServer(data));

export const setV3ThreadTitle = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(setV3ThreadTitleInputSchema))
  .handler(async ({ data }) => setV3ThreadTitleServer(data));

export const deleteV3Thread = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(deleteV3ThreadInputSchema))
  .handler(async ({ data }) => deleteV3ThreadServer(data.threadId));
