import { FileIcon } from "lucide-react";
import type {
  AudioPart,
  DocumentPart,
  ImagePart,
  VideoPart,
} from "@tanstack/ai";
import type { AttachmentData } from "~/shared/ai-elements/attachments";
import { resolveSourceUrl } from "~/features/chat-v1/ui/message-row-utils";

type RenderableAttachmentSource = {
  type: "url" | "data";
  value: string;
  mimeType?: string;
};

export type RenderableAttachmentPart = {
  type: "image" | "audio" | "video" | "document";
  source: RenderableAttachmentSource;
  filename?: string;
};

function isRenderableAttachmentSource(
  source: unknown,
): source is RenderableAttachmentSource {
  if (!source || typeof source !== "object") return false;
  const maybe = source as {
    type?: unknown;
    value?: unknown;
  };
  const validType = maybe.type === "url" || maybe.type === "data";
  return validType && typeof maybe.value === "string";
}

export function isRenderableAttachmentPart(
  part: unknown,
): part is RenderableAttachmentPart {
  if (!part || typeof part !== "object") return false;
  const maybe = part as {
    type?: unknown;
    source?: unknown;
  };
  switch (maybe.type) {
    case "image":
    case "audio":
    case "video":
    case "document":
      return isRenderableAttachmentSource(maybe.source);
    default:
      return false;
  }
}

function getFallbackMimeType(part: RenderableAttachmentPart): string {
  switch (part.type) {
    case "image":
      return "image/*";
    case "audio":
      return "audio/*";
    case "video":
      return "video/*";
    case "document":
      return "application/octet-stream";
    default: {
      const _never: never = part;
      return _never;
    }
  }
}

function resolveAttachmentFilename(
  part: RenderableAttachmentPart,
): string | undefined {
  if ("filename" in part && typeof part.filename === "string") {
    const trimmed = part.filename.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (part.type !== "document") return undefined;
  if (part.source.mimeType === "application/pdf") return "document.pdf";
  if (part.source.mimeType?.startsWith("text/")) return "document.txt";
  return "document";
}

export function toAttachmentData(
  part: RenderableAttachmentPart,
  id: string,
): AttachmentData {
  return {
    id,
    type: "file",
    filename: resolveAttachmentFilename(part),
    mediaType: part.source.mimeType ?? getFallbackMimeType(part),
    url: resolveSourceUrl(part.source),
  };
}

export function ImagePartView({ part }: { part: ImagePart }) {
  const src = resolveSourceUrl(part.source);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="border-border bg-muted/20 block max-w-sm overflow-hidden rounded-md border"
    >
      <img
        src={src}
        alt="Attached image"
        loading="lazy"
        decoding="async"
        className="h-auto w-full object-contain"
      />
    </a>
  );
}

export function MediaPartView({
  part,
  kind,
}: {
  part: AudioPart | VideoPart;
  kind: "audio" | "video";
}) {
  const src = resolveSourceUrl(part.source);
  return kind === "audio" ? (
    <audio
      controls
      preload="metadata"
      src={src}
      className="border-border bg-muted/20 w-full max-w-sm rounded-md border"
    />
  ) : (
    <video
      controls
      preload="metadata"
      src={src}
      className="border-border bg-muted/20 w-full max-w-sm rounded-md border"
    />
  );
}

export function DocumentPartView({ part }: { part: DocumentPart }) {
  const src = resolveSourceUrl(part.source);
  const label = part.source.mimeType ?? "Document";
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="border-border bg-muted/20 text-foreground hover:bg-muted/30 inline-flex max-w-sm items-center gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <FileIcon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Open {label}</span>
    </a>
  );
}

export function InteractiveToolFallback({ message }: { message: string }) {
  return (
    <div className="border-border bg-muted/20 text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
      {message}
    </div>
  );
}
