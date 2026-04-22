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
      className="block max-w-sm overflow-hidden rounded-md border border-border bg-muted/20"
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
      className="w-full max-w-sm rounded-md border border-border bg-muted/20"
    />
  ) : (
    <video
      controls
      preload="metadata"
      src={src}
      className="w-full max-w-sm rounded-md border border-border bg-muted/20"
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
      className="inline-flex max-w-sm items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground hover:bg-muted/30"
    >
      <FileIcon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">Open {label}</span>
    </a>
  );
}

export function InteractiveToolFallback({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      {message}
    </div>
  );
}
