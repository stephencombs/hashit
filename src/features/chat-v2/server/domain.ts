import { z } from "zod";

export const v2ThreadIdSchema = z.string().trim().min(1).max(128);
export const v2MessagePageLimitSchema = z.number().int().min(1).max(200);

export const v2ThreadMessagesPageInputSchema = z.object({
  threadId: v2ThreadIdSchema,
  before: z.string().trim().min(1).max(128).optional(),
  limit: v2MessagePageLimitSchema.default(80),
});

export type V2ThreadMessagesPageInput = z.input<
  typeof v2ThreadMessagesPageInputSchema
>;
export type ResolvedV2ThreadMessagesPageInput = z.output<
  typeof v2ThreadMessagesPageInputSchema
>;

export const V2_DURABLE_CUSTOM_EVENT_NAMES = {
  persistenceComplete: "persistence_complete",
  runAborted: "run_aborted",
  runComplete: "run_complete",
  runError: "run_error",
  runWaitingInput: "run_waiting_input",
  specComplete: "spec_complete",
  specPatch: "spec_patch",
  threadTitleUpdated: "thread_title_updated",
} as const;

export type V2RunTerminalEventName =
  | typeof V2_DURABLE_CUSTOM_EVENT_NAMES.runAborted
  | typeof V2_DURABLE_CUSTOM_EVENT_NAMES.runComplete
  | typeof V2_DURABLE_CUSTOM_EVENT_NAMES.runError
  | typeof V2_DURABLE_CUSTOM_EVENT_NAMES.runWaitingInput;
