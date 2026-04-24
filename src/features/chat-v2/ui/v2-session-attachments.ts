import {
  attachmentResponseSchema,
  type AttachmentResponse,
} from "~/lib/attachment-schemas";

export async function uploadV2AttachmentSource(input: {
  threadId: string;
  url: string;
  mediaType: string;
  filename: string;
}): Promise<AttachmentResponse> {
  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Could not read attachment source (${response.status})`);
  }

  const blob = await response.blob();
  const file = new File([blob], input.filename || "upload", {
    type: input.mediaType || blob.type || "application/octet-stream",
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("threadId", input.threadId);

  const uploadResponse = await fetch(
    `/api/v2/prompt-attachments?threadId=${encodeURIComponent(input.threadId)}`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!uploadResponse.ok) {
    let detail: string | undefined;
    try {
      const body = (await uploadResponse.json()) as {
        message?: string;
        why?: string;
      };
      detail = body.message ?? body.why;
    } catch {
      // ignore
    }
    throw new Error(detail ?? `Upload failed (${uploadResponse.status})`);
  }

  const json = await uploadResponse.json();
  return attachmentResponseSchema.parse(json);
}

export function toAbsoluteAttachmentUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}
