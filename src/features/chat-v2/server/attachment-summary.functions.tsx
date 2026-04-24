import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { listV2ThreadMessagesServer } from "./messages.server";
import type { V2RuntimeMessage } from "./runtime-message";

const v2ThreadIdInputSchema = z.string().min(1).max(128);

const ATTACHMENT_TYPES = ["image", "audio", "video", "document"] as const;
type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type V2ThreadAttachmentSummary = {
  totalCount: number;
  countsByType: Record<AttachmentType, number>;
};

function buildEmptySummary(): V2ThreadAttachmentSummary {
  return {
    totalCount: 0,
    countsByType: {
      image: 0,
      audio: 0,
      video: 0,
      document: 0,
    },
  };
}

function summarizeV2ThreadAttachments(
  messages: Array<V2RuntimeMessage>,
): V2ThreadAttachmentSummary {
  const summary = buildEmptySummary();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "image") {
        summary.totalCount += 1;
        summary.countsByType.image += 1;
        continue;
      }
      if (part.type === "audio") {
        summary.totalCount += 1;
        summary.countsByType.audio += 1;
        continue;
      }
      if (part.type === "video") {
        summary.totalCount += 1;
        summary.countsByType.video += 1;
        continue;
      }
      if (part.type === "document") {
        summary.totalCount += 1;
        summary.countsByType.document += 1;
      }
    }
  }
  return summary;
}

function V2ThreadAttachmentSummaryPanel({
  summary,
}: {
  summary: V2ThreadAttachmentSummary;
}) {
  if (summary.totalCount === 0) {
    return null;
  }

  return (
    <div className="border-b px-6 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          Attachments: {summary.totalCount}
        </span>
        {ATTACHMENT_TYPES.map((type) => {
          const count = summary.countsByType[type];
          if (count === 0) return null;
          return (
            <span key={type} className="rounded border px-2 py-0.5">
              {type}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const getV2ThreadAttachmentSummary = createServerFn({ method: "GET" })
  .inputValidator(zodValidator(v2ThreadIdInputSchema))
  .handler(async ({ data }) => {
    const messages = await listV2ThreadMessagesServer(data);
    const summary = summarizeV2ThreadAttachments(messages);
    const Renderable = await renderServerComponent(
      <V2ThreadAttachmentSummaryPanel summary={summary} />,
    );

    return {
      Renderable,
      summary,
    };
  });
