import { z } from "zod";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REQUEST = 5;

export const ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const attachmentIdSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(ATTACHMENT_ID_PATTERN);

export const attachmentResponseSchema = z.object({
  id: attachmentIdSchema,
  url: z.string(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  filename: z.string(),
  size: z.number().int().positive(),
});

export type AttachmentResponse = z.infer<typeof attachmentResponseSchema>;

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Inspect the first bytes of a file and return the most likely MIME type from
 * our allowlist. Returns null when the magic bytes do not match any allowed
 * type. Used to defend against forged Content-Type headers.
 */
export function sniffAllowedMimeType(
  bytes: Uint8Array,
): AllowedMimeType | null {
  if (bytes.length < 12) return null;

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x68 &&
    bytes[9] === 0x65 &&
    bytes[10] === 0x69 &&
    bytes[11] === 0x63
  ) {
    return "image/heic";
  }

  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }

  return null;
}
