import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const duplicateFieldSchema = z.object({
  name: z.string().describe('Field identifier used as key in the response'),
  label: z.string().describe('Display label shown to the user'),
  type: z.enum(['text', 'number', 'email', 'textarea', 'select', 'date', 'readonly']),
  currentValue: z
    .union([z.string(), z.number(), z.boolean()])
    .nullable()
    .optional()
    .describe('The value that already exists in the system'),
  proposedValue: z
    .union([z.string(), z.number(), z.boolean()])
    .nullable()
    .optional()
    .describe('The value that was being submitted when the conflict was detected'),
  editable: z
    .boolean()
    .nullable()
    .optional()
    .describe('Whether the user can edit this field to resolve the conflict (default: true)'),
  conflicting: z
    .boolean()
    .nullable()
    .optional()
    .describe('Whether this field is the source of the conflict — highlight it in the UI'),
  required: z.boolean().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .optional()
    .describe('Choices for select fields'),
  helpText: z
    .string()
    .nullable()
    .optional()
    .describe('Short helper text shown below the field'),
})

const resolutionActionSchema = z.object({
  id: z.string().describe('Identifier returned to the agent when this action is chosen'),
  label: z.string().describe('Button label shown to the user'),
  variant: z
    .enum(['primary', 'secondary', 'destructive'])
    .nullable()
    .optional()
    .describe('Visual weight of the button; defaults to secondary'),
  requiresEdits: z
    .boolean()
    .nullable()
    .optional()
    .describe('When true, the edited field values are validated and included in the result'),
  description: z
    .string()
    .nullable()
    .optional()
    .describe('Short tooltip / sub-label explaining what this action does'),
})

export const resolveDuplicateEntityTool = toolDefinition({
  name: 'resolve_duplicate_entity',
  description:
    "Display an interactive conflict-resolution UI when another tool returns a uniqueness or duplicate error. " +
    "Provide the conflicting entity's current values alongside the values you were trying to submit, " +
    "mark which fields caused the conflict, and offer one or more resolution actions for the user to choose. " +
    "IMPORTANT: After calling this tool, do NOT emit any text. End your turn immediately and wait for the user's response.",
  inputSchema: z.object({
    title: z.string().describe('Heading shown in the conflict card'),
    description: z
      .string()
      .nullable()
      .optional()
      .describe('Brief explanation of the conflict shown below the title'),
    entityLabel: z
      .string()
      .nullable()
      .optional()
      .describe('Noun for the entity type, e.g. "asset", "employee record"'),
    conflictReason: z
      .string()
      .nullable()
      .optional()
      .describe('Short technical reason for the conflict, e.g. "asset_name + issue_date must be unique per employee"'),
    fields: z
      .array(duplicateFieldSchema)
      .describe('Fields to display — show current and proposed values side by side'),
    actions: z
      .array(resolutionActionSchema)
      .optional()
      .describe(
        'Resolution actions to offer. If omitted, a single primary "Submit" button is shown. ' +
          'Typical actions: retry with edits (requiresEdits: true), overwrite/force, skip/cancel.',
      ),
  }),
  outputSchema: z.object({
    actionId: z.string(),
    values: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
    changes: z.record(
      z.string(),
      z.object({ from: z.unknown(), to: z.unknown() }),
    ),
  }),
})
// NOTE: No .server() execute. This is a client tool. The UI supplies the
// output via a .client() handler that awaits the user's resolution action
// (see src/components/chat/use-chat-runtime.ts). The TanStack AI runtime
// handles the pause/persist/resume around the awaited promise.

export type DuplicateField = {
  name: string
  label: string
  type: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'date' | 'readonly'
  currentValue?: string | number | boolean
  proposedValue?: string | number | boolean
  editable?: boolean
  conflicting?: boolean
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  helpText?: string
}

export type ResolutionAction = {
  id: string
  label: string
  variant?: 'primary' | 'secondary' | 'destructive'
  requiresEdits?: boolean
  description?: string
}

export type DuplicateResolutionSpec = {
  title: string
  description?: string
  entityLabel?: string
  conflictReason?: string
  fields: DuplicateField[]
  actions?: ResolutionAction[]
}

export type ResolutionOutput = {
  actionId: string
  values: Record<string, string | number | boolean>
  changes: Record<string, { from: unknown; to: unknown }>
}
