import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const collectFormDataTool = toolDefinition({
  name: "collect_form_data",
  description:
    "Display an inline form to collect structured data from the user. Use when you need multiple pieces of information (registration, configuration, multi-field queries). Specify each field with its type, label, and validation requirements. The form will render inline and the user's responses will be returned as structured data. IMPORTANT: After this tool returns, do NOT generate any text response. End your turn and wait for the user to submit the form.",
  inputSchema: z.object({
    title: z.string().describe("Form heading displayed to the user"),
    description: z
      .string()
      .nullable()
      .optional()
      .describe("Brief explanation of what the form collects"),
    fields: z
      .array(
        z.object({
          name: z
            .string()
            .describe("Field identifier used as key in the response"),
          label: z.string().describe("Display label shown above the field"),
          type: z.enum([
            "text",
            "number",
            "email",
            "textarea",
            "select",
            "checkbox",
            "date",
          ]),
          required: z
            .boolean()
            .nullable()
            .optional()
            .describe("Whether the field must be filled"),
          placeholder: z
            .string()
            .nullable()
            .optional()
            .describe("Hint text shown when empty"),
          options: z
            .array(
              z.object({
                label: z.string(),
                value: z.string(),
              }),
            )
            .nullable()
            .optional()
            .describe("Choices for select fields"),
          defaultValue: z
            .union([z.string(), z.number(), z.boolean()])
            .nullable()
            .optional(),
        }),
      )
      .describe("Ordered list of form fields"),
    submitLabel: z
      .string()
      .nullable()
      .optional()
      .describe('Custom submit button text (default: "Submit")'),
  }),
  outputSchema: z.object({
    data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }),
});
// NOTE: No .server() execute. This is a client tool. The UI supplies the
// output via a .client() handler registered on the client side (see
// src/features/chat-v2/ui/v2-chat-surface.tsx and
// src/shared/lib/interactive-tool-registry.ts). The TanStack AI runtime pauses the
// agent loop until that handler resolves, persists the tool-call part with
// state: "result" and the submitted output, then resumes automatically.

export type FormField = {
  name: string;
  label: string;
  type:
    | "text"
    | "number"
    | "email"
    | "textarea"
    | "select"
    | "checkbox"
    | "date";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string | number | boolean;
};

export type FormSpec = {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
};

export type CollectFormDataOutput = {
  data: Record<string, string | number | boolean>;
};
