import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const createPlanTool = toolDefinition({
  name: 'create_plan',
  description:
    'Create a structured execution plan when the user asks for help planning, breaking down, or organizing a multi-step task. The plan will be displayed as a rich UI card. After calling this tool, respond with a brief message like "Here\'s your plan!" or ask if they\'d like to adjust anything. Do not repeat the plan contents in your text response.',
  inputSchema: z.object({
    title: z.string().describe('Short title for the plan'),
    description: z
      .string()
      .describe('Brief summary of what the plan accomplishes'),
    steps: z
      .array(
        z.object({
          title: z.string().describe('Step title'),
          description: z.string().describe('What this step involves'),
        }),
      )
      .describe('Ordered list of steps'),
  }),
}).server(async (args) => {
  return { success: true, plan: args }
})
