import { FileIcon } from "lucide-react";
import type {
  AudioPart,
  DocumentPart,
  ImagePart,
  VideoPart,
} from "@tanstack/ai";
import { resolveSourceUrl } from "~/components/chat/message-row-utils";

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
