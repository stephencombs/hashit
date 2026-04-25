import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { attachmentResponseSchema } from "~/shared/lib/attachment-schemas";
import { uploadAttachment } from "~/shared/lib/server/attachments";
import { parseAttachmentUploadRequest } from "~/shared/lib/server/prompt-attachments-upload";

const ATTACHMENT_ID_LENGTH = 24;

export const Route = createFileRoute("/api/prompt-attachments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { upload } = await parseAttachmentUploadRequest(request);

        const id = nanoid(ATTACHMENT_ID_LENGTH);
        await uploadAttachment({
          id,
          contentType: upload.mimeType,
          originalFilename: upload.filename || `${id}-upload`,
          body: upload.buffer,
          size: upload.buffer.byteLength,
        });

        const response = attachmentResponseSchema.parse({
          id,
          url: `/api/prompt-attachments/${id}`,
          mimeType: upload.mimeType,
          filename: upload.filename || `${id}-upload`,
          size: upload.buffer.byteLength,
        });

        return Response.json(response, { status: 201 });
      },
    },
  },
});
