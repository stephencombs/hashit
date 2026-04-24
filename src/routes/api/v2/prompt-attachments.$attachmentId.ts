import { createFileRoute } from "@tanstack/react-router";
import { Readable } from "node:stream";
import { ATTACHMENT_ID_PATTERN } from "~/lib/attachment-schemas";
import { getAttachment } from "~/lib/server/attachments";
import { getV2ThreadByIdServer } from "~/features/chat-v2/server/threads.server";

const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function resolveThreadId(request: Request): string | null {
  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("threadId")?.trim() ?? "";
  if (!THREAD_ID_PATTERN.test(value)) return null;
  return value;
}

export const Route = createFileRoute("/api/v2/prompt-attachments/$attachmentId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { attachmentId } = params;
        if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) {
          return new Response(null, { status: 404 });
        }

        const threadId = resolveThreadId(request);
        if (!threadId) {
          return new Response(null, { status: 404 });
        }

        try {
          await getV2ThreadByIdServer(threadId);
        } catch {
          return new Response(null, { status: 404 });
        }

        const download = await getAttachment(attachmentId);
        if (!download || !download.threadId || download.threadId !== threadId) {
          return new Response(null, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", download.contentType);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("Content-Disposition", "inline");
        if (typeof download.contentLength === "number") {
          headers.set("Content-Length", String(download.contentLength));
        }
        if (download.originalFilename) {
          headers.set(
            "X-Original-Filename",
            encodeURIComponent(download.originalFilename),
          );
        }

        const webStream = Readable.toWeb(
          download.stream as unknown as Readable,
        ) as unknown as ReadableStream<Uint8Array>;

        return new Response(webStream, { status: 200, headers });
      },
    },
  },
});
