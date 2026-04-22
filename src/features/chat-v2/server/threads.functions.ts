import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  createV2ThreadServer,
  listV2ThreadsServer,
} from "./threads.server";

const createV2ThreadInputSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  title: z.string().trim().max(200).optional(),
});

export const listV2Threads = createServerFn({ method: "GET" }).handler(
  async () => listV2ThreadsServer(),
);

export const createV2Thread = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createV2ThreadInputSchema))
  .handler(async ({ data }) => createV2ThreadServer(data));
