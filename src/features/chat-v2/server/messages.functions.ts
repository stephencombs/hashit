import { createServerFn } from "@tanstack/react-start";
import { zodValidator } from "@tanstack/zod-adapter";
import type { V2RuntimeMessage, V2ThreadMessagesPage } from "../types";
import { v2ThreadIdSchema, v2ThreadMessagesPageInputSchema } from "./domain";
import {
  getV2ThreadSessionServer,
  listV2ThreadMessageUiSpecsServer,
  listV2ThreadMessagesPageServer,
  listV2ThreadMessagesServer,
  type V2ThreadMessageUiSpecs,
} from "./messages.server";

export const listV2ThreadMessages = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdSchema))
  .handler(
    async ({ data }): Promise<Array<V2RuntimeMessage>> =>
      listV2ThreadMessagesServer(data),
  );

export const listV2ThreadMessagesPage = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadMessagesPageInputSchema))
  .handler(
    async ({ data }): Promise<V2ThreadMessagesPage> =>
      listV2ThreadMessagesPageServer(data),
  );

export const listV2ThreadMessageUiSpecs = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdSchema))
  .handler(
    async ({ data }): Promise<Array<V2ThreadMessageUiSpecs>> =>
      listV2ThreadMessageUiSpecsServer(data),
  );

export const getV2ThreadSession = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdSchema))
  .handler(async ({ data }) => getV2ThreadSessionServer(data));
