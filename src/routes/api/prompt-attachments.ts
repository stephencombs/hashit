import { createFileRoute } from "@tanstack/react-router";
import { createError } from "evlog";
import { nanoid } from "nanoid";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentResponseSchema,
  isAllowedMimeType,
  sniffAllowedMimeType,
} from "~/lib/attachment-schemas";
import { uploadAttachment } from "~/lib/server/attachments";

const ATTACHMENT_ID_LENGTH = 24;

export const Route = createFileRoute("/api/prompt-attachments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
          throw createError({
            message: "Expected multipart/form-data upload",
            status: 415,
            why: `Received Content-Type "${contentType || "none"}"`,
            fix: 'Send a multipart/form-data request with a "file" field',
          });
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch (err) {
          throw createError({
            message: "Failed to parse multipart upload",
            status: 400,
            why: err instanceof Error ? err.message : String(err),
            fix: "Ensure the request body is a valid multipart form payload",
          });
        }

        const file = formData.get("file");
        if (!(file instanceof File)) {
          throw createError({
            message: 'Missing "file" field in upload',
            status: 400,
            why: 'No File entry was found under the "file" key',
            fix: 'Append the upload as FormData.append("file", file)',
          });
        }

        if (file.size === 0) {
          throw createError({
            message: "Uploaded file is empty",
            status: 400,
            why: "File size is 0 bytes",
            fix: "Choose a non-empty file before uploading",
          });
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw createError({
            message: "Uploaded file exceeds maximum size",
            status: 413,
            why: `Received ${file.size} bytes (limit ${MAX_ATTACHMENT_BYTES})`,
            fix: `Upload a file smaller than ${MAX_ATTACHMENT_BYTES} bytes`,
          });
        }

        const claimedMime = file.type.toLowerCase();
        if (!isAllowedMimeType(claimedMime)) {
          throw createError({
            message: "Unsupported attachment type",
            status: 415,
            why: `Content-Type "${claimedMime || "unknown"}" is not in the allowlist`,
            fix: `Upload one of: ${ALLOWED_MIME_TYPES.join(", ")}`,
          });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const sniffed = sniffAllowedMimeType(buffer);
        if (!sniffed) {
          throw createError({
            message: "Unable to verify file type from contents",
            status: 415,
            why: "File magic bytes did not match any allowed type",
            fix: "Re-export the file or choose a supported PNG/JPEG/WEBP/GIF/HEIC/PDF",
          });
        }
        if (sniffed !== claimedMime) {
          throw createError({
            message: "File contents do not match Content-Type",
            status: 415,
            why: `Magic bytes resolved to "${sniffed}" but Content-Type is "${claimedMime}"`,
            fix: "Send the file with the correct Content-Type or re-export it",
          });
        }

        const id = nanoid(ATTACHMENT_ID_LENGTH);
        await uploadAttachment({
          id,
          contentType: sniffed,
          originalFilename: file.name || `${id}-upload`,
          body: buffer,
          size: buffer.byteLength,
        });

        const response = attachmentResponseSchema.parse({
          id,
          url: `/api/prompt-attachments/${id}`,
          mimeType: sniffed,
          filename: file.name || `${id}-upload`,
          size: buffer.byteLength,
        });

        return Response.json(response, { status: 201 });
      },
    },
  },
});
