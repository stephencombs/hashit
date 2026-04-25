import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { automationRuns, automations } from "~/db/schema";

const coercedDate = z.coerce.date();

export const selectAutomationSchema = createSelectSchema(automations, {
  createdAt: coercedDate,
  updatedAt: coercedDate,
  lastRunAt: coercedDate.nullable(),
  nextRunAt: coercedDate.nullable(),
  deletedAt: coercedDate.nullable(),
});

export const selectAutomationRunSchema = createSelectSchema(automationRuns, {
  startedAt: coercedDate,
  completedAt: coercedDate.nullable(),
});

export const createAutomationBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["chat-prompt", "webhook"]),
  cronExpression: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional().default(true),
});

export const updateAutomationBodySchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["chat-prompt", "webhook"]).optional(),
  cronExpression: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type Automation = z.infer<typeof selectAutomationSchema>;
export type AutomationRun = z.infer<typeof selectAutomationRunSchema>;
