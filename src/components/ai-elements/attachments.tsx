"use client";

import { Button } from "~/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import { cn } from "~/lib/utils";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

export type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown";

export type AttachmentVariant = "grid" | "inline" | "list";

const mediaCategoryIcons: Record<AttachmentMediaCategory, LucideIcon> = {
  audio: Music2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  source: GlobeIcon,
  unknown: PaperclipIcon,
  video: VideoIcon,
};

export const getMediaCategory = (
  data: AttachmentData,
): AttachmentMediaCategory => {
  if (data.type === "source-document") return "source";
  const mediaType = data.mediaType ?? "";
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
    return "document";
  }
  return "unknown";
};

export const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === "source-document") {
    return data.title || data.filename || "Source";
  }
  const category = getMediaCategory(data);
  return data.filename || (category === "image" ? "Image" : "Attachment");
};

function getContainerClasses(variant: AttachmentVariant): string {
  switch (variant) {
    case "grid":
      return "flex flex-wrap gap-2";
    case "inline":
      return "flex flex-wrap items-center gap-1";
    case "list":
      return "flex flex-col gap-1";
    default: {
      const _never: never = variant;
      return _never;
    }
  }
}

function getAttachmentClasses(variant: AttachmentVariant): string {
  switch (variant) {
    case "grid":
      return "group border-border bg-muted/20 relative size-24 overflow-hidden rounded-md border";
    case "inline":
      return "group border-border bg-muted/20 inline-flex items-center gap-2 rounded-md border px-2 py-1";
    case "list":
      return "group border-border bg-muted/20 inline-flex w-full items-center gap-2 rounded-md border px-2 py-2";
    default: {
      const _never: never = variant;
      return _never;
    }
  }
}

function renderAttachmentImage(
  url: string,
  filename: string | undefined,
  isGrid: boolean,
) {
  return isGrid ? (
    <img
      src={url}
      alt={filename || "Attachment"}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
    />
  ) : (
    <img
      src={url}
      alt={filename || "Attachment"}
      loading="lazy"
      decoding="async"
      className="size-6 rounded object-cover"
    />
  );
}

type AttachmentsContextValue = {
  variant: AttachmentVariant;
};

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

type AttachmentContextValue = {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
};

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

export const useAttachmentsContext = () =>
  useContext(AttachmentsContext) ?? { variant: "grid" as const };

export const useAttachmentContext = () => {
  const ctx = useContext(AttachmentContext);
  if (!ctx) {
    throw new Error("Attachment components must be used within <Attachment />");
  }
  return ctx;
};

export type AttachmentsProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AttachmentVariant;
};

export const Attachments = ({
  variant = "grid",
  className,
  children,
  ...props
}: AttachmentsProps) => {
  const contextValue = useMemo(() => ({ variant }), [variant]);
  return (
    <AttachmentsContext.Provider value={contextValue}>
      <div className={cn(getContainerClasses(variant), className)} {...props}>
        {children}
      </div>
    </AttachmentsContext.Provider>
  );
};

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: () => void;
};

export const Attachment = ({
  data,
  onRemove,
  className,
  children,
  ...props
}: AttachmentProps) => {
  const { variant } = useAttachmentsContext();
  const mediaCategory = getMediaCategory(data);
  const contextValue = useMemo<AttachmentContextValue>(
    () => ({ data, mediaCategory, onRemove, variant }),
    [data, mediaCategory, onRemove, variant],
  );

  return (
    <AttachmentContext.Provider value={contextValue}>
      <div className={cn(getAttachmentClasses(variant), className)} {...props}>
        {children}
      </div>
    </AttachmentContext.Provider>
  );
};

export type AttachmentPreviewProps = HTMLAttributes<HTMLDivElement> & {
  fallbackIcon?: ReactNode;
};

export const AttachmentPreview = ({
  fallbackIcon,
  className,
  ...props
}: AttachmentPreviewProps) => {
  const { data, mediaCategory, variant } = useAttachmentContext();
  const iconSize = variant === "inline" ? "size-3" : "size-4";

  const renderIcon = (Icon: LucideIcon) => (
    <div
      className={cn(
        "text-muted-foreground flex items-center justify-center",
        variant === "grid" ? "h-full w-full" : "size-6 shrink-0",
      )}
    >
      <Icon className={iconSize} aria-hidden />
    </div>
  );

  const renderContent = () => {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
      return renderAttachmentImage(data.url, data.filename, variant === "grid");
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
      return variant === "grid" ? (
        <video
          src={data.url}
          muted
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        renderIcon(VideoIcon)
      );
    }

    const Icon = mediaCategoryIcons[mediaCategory];
    return fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <div
      className={cn(
        "min-w-0",
        variant === "grid" ? "h-full w-full" : "inline-flex items-center",
        className,
      )}
      {...props}
    >
      {renderContent()}
    </div>
  );
};

export type AttachmentInfoProps = HTMLAttributes<HTMLDivElement> & {
  showMediaType?: boolean;
};

export const AttachmentInfo = ({
  showMediaType = false,
  className,
  ...props
}: AttachmentInfoProps) => {
  const { data, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);

  if (variant === "grid") return null;

  return (
    <div className={cn("min-w-0", className)} {...props}>
      <p className="truncate text-xs font-medium">{label}</p>
      {showMediaType && data.mediaType ? (
        <p className="text-muted-foreground truncate text-[10px]">
          {data.mediaType}
        </p>
      ) : null}
    </div>
  );
};

export type AttachmentRemoveProps = ComponentProps<typeof Button> & {
  label?: string;
};

export const AttachmentRemove = ({
  label = "Remove",
  className,
  children,
  ...props
}: AttachmentRemoveProps) => {
  const { onRemove, variant } = useAttachmentContext();
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  if (!onRemove) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      onClick={handleClick}
      className={cn(
        "text-muted-foreground hover:text-foreground shrink-0",
        variant === "grid"
          ? "bg-background/80 absolute top-1 right-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
          : "size-6",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon className="size-3" aria-hidden />}
      <span className="sr-only">{label}</span>
    </Button>
  );
};

export type AttachmentHoverCardProps = ComponentProps<typeof HoverCard>;

export const AttachmentHoverCard = ({
  openDelay = 0,
  closeDelay = 0,
  ...props
}: AttachmentHoverCardProps) => (
  <HoverCard openDelay={openDelay} closeDelay={closeDelay} {...props} />
);

export type AttachmentHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>;

export const AttachmentHoverCardTrigger = (
  props: AttachmentHoverCardTriggerProps,
) => <HoverCardTrigger {...props} />;

export type AttachmentHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>;

export const AttachmentHoverCardContent = ({
  align = "start",
  className,
  ...props
}: AttachmentHoverCardContentProps) => (
  <HoverCardContent align={align} className={cn("w-auto", className)} {...props} />
);

export type AttachmentEmptyProps = HTMLAttributes<HTMLDivElement>;

export const AttachmentEmpty = ({
  className,
  children,
  ...props
}: AttachmentEmptyProps) => (
  <div
    className={cn("text-muted-foreground text-xs", className)}
    {...props}
  >
    {children ?? "No attachments"}
  </div>
);
