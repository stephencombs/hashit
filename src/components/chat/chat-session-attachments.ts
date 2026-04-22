import {
  attachmentResponseSchema,
  type AttachmentResponse,
} from "~/lib/attachment-schemas";

export async function uploadAttachmentSource(
  url: string,
  mediaType: string,
  filename: string,
): Promise<AttachmentResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read attachment source (${response.status})`);
  }

  const blob = await response.blob();
  const file = new File([blob], filename || "upload", {
    type: mediaType || blob.type || "application/octet-stream",
  });

  const formData = new FormData();
  formData.append("file", file);

  const uploadResponse = await fetch("/api/prompt-attachments", {
    method: "POST",
    body: formData,
  });

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

export function isLocalOrPrivateAttachmentUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;

  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (!match172) return false;
  const octet = Number(match172[1]);
  return octet >= 16 && octet <= 31;
}
