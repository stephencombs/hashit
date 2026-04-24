import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import type { V2RuntimeMessage } from "./runtime-message";
import {
  getV2ThreadSessionServer,
  listV2ThreadMessageUiSpecsServer,
  listV2ThreadMessagesServer,
  type V2ThreadMessageUiSpecs,
} from "./messages.server";

const v2ThreadIdInputSchema = z.string().min(1).max(128);

export const listV2ThreadMessages = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(
    async ({ data }): Promise<Array<V2RuntimeMessage>> =>
      listV2ThreadMessagesServer(data),
  );

// Compatibility alias for stale query-options modules still importing
// `listV2ThreadMessagesPage` during dev HMR transitions.
export const listV2ThreadMessagesPage = listV2ThreadMessages;

export const listV2ThreadMessageUiSpecs = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(
    async ({ data }): Promise<Array<V2ThreadMessageUiSpecs>> =>
      listV2ThreadMessageUiSpecsServer(data),
  );

export const getV2ThreadSession = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(async ({ data }) => getV2ThreadSessionServer(data));
