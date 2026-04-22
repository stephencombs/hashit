import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  getV2ThreadSessionServer,
  listV2ThreadMessagesServer,
} from "./messages.server";

const v2ThreadIdInputSchema = z.string().min(1).max(128);

export const listV2ThreadMessages = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(async ({ data }) => listV2ThreadMessagesServer(data));

export const getV2ThreadSession = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(async ({ data }) => getV2ThreadSessionServer(data));
