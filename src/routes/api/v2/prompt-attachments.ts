import { createFileRoute } from "@tanstack/react-router";
import { createError } from "evlog";
import { nanoid } from "nanoid";
import { attachmentResponseSchema } from "~/lib/attachment-schemas";
import { uploadAttachment } from "~/lib/server/attachments";
import { parseAttachmentUploadRequest } from "~/lib/server/prompt-attachments-upload";
import { getV2ThreadByIdServer } from "~/features/chat-v2/server/threads.server";

const ATTACHMENT_ID_LENGTH = 24;
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function resolveThreadId(request: Request, formData: FormData): string {
  const requestUrl = new URL(request.url);
  const fromSearch = requestUrl.searchParams.get("threadId");
  const fromFormData = formData.get("threadId");
  const rawThreadId =
    typeof fromFormData === "string" ? fromFormData : fromSearch;
  const threadId = rawThreadId?.trim() ?? "";

  if (!THREAD_ID_PATTERN.test(threadId)) {
    throw createError({
      message: "Invalid or missing V2 thread id",
      status: 400,
      why: "threadId must be provided and contain only letters, numbers, underscores, or hyphens.",
      fix: 'Include a valid `threadId` query param or multipart field (for example `threadId=v2_abcd1234`).',
    });
  }

  return threadId;
}

export const Route = createFileRoute("/api/v2/prompt-attachments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { formData, upload } = await parseAttachmentUploadRequest(request);
        const threadId = resolveThreadId(request, formData);

        try {
          await getV2ThreadByIdServer(threadId);
        } catch {
          throw createError({
            message: "V2 thread not found for attachment upload",
            status: 404,
            why: `No active V2 thread exists for "${threadId}".`,
            fix: "Create or load the thread first, then retry the upload.",
          });
        }

        const id = nanoid(ATTACHMENT_ID_LENGTH);
        await uploadAttachment({
          id,
          contentType: upload.mimeType,
          originalFilename: upload.filename || `${id}-upload`,
          body: upload.buffer,
          size: upload.buffer.byteLength,
          threadId,
        });

        const response = attachmentResponseSchema.parse({
          id,
          url: `/api/v2/prompt-attachments/${id}?threadId=${encodeURIComponent(threadId)}`,
          mimeType: upload.mimeType,
          filename: upload.filename || `${id}-upload`,
          size: upload.buffer.byteLength,
        });

        return Response.json(response, { status: 201 });
      },
    },
  },
});
