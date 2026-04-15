import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const collectFormDataTool = toolDefinition({
  name: 'collect_form_data',
  description:
    "Display an inline form to collect structured data from the user. Use when you need multiple pieces of information (registration, configuration, multi-field queries). Specify each field with its type, label, and validation requirements. The form will render inline and the user's responses will be returned as structured data. IMPORTANT: After this tool returns, do NOT generate any text response. End your turn and wait for the user to submit the form.",
  inputSchema: z.object({
    title: z.string().describe('Form heading displayed to the user'),
    description: z
      .string()
      .optional()
      .describe('Brief explanation of what the form collects'),
    fields: z
      .array(
        z.object({
          name: z
            .string()
            .describe('Field identifier used as key in the response'),
          label: z.string().describe('Display label shown above the field'),
          type: z.enum([
            'text',
            'number',
            'email',
            'textarea',
            'select',
            'checkbox',
            'date',
          ]),
          required: z
            .boolean()
            .optional()
            .describe('Whether the field must be filled'),
          placeholder: z
            .string()
            .optional()
            .describe('Hint text shown when empty'),
          options: z
            .array(
              z.object({
                label: z.string(),
                value: z.string(),
              }),
            )
            .optional()
            .describe('Choices for select fields'),
          defaultValue: z
            .union([z.string(), z.number(), z.boolean()])
            .optional(),
        }),
      )
      .describe('Ordered list of form fields'),
    submitLabel: z
      .string()
      .optional()
      .describe('Custom submit button text (default: "Submit")'),
  }),
})
// NOTE: No .server() execute — intentional.
//
// With a .server() execute, TanStack AI's StreamProcessor receives TOOL_CALL_END
// with a non-null result and automatically calls checkForContinuation, triggering
// a server round-trip before the user has submitted the form. When the user then
// submits (addToolResult), a second continuation fires, producing two separate
// agent responses and duplicate tool calls.
//
// As a ToolDefinitionInstance (no execute), TOOL_CALL_END carries a null result.
// StreamProcessor does not trigger checkForContinuation for null results, so only
// the user's explicit addToolResult call produces a continuation.

export type FormField = {
  name: string
  label: string
  type: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'checkbox' | 'date'
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  defaultValue?: string | number | boolean
}

export type FormSpec = {
  title: string
  description?: string
  fields: FormField[]
  submitLabel?: string
}
