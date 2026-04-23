import { createFileRoute } from "@tanstack/react-router";
import { ensureDurableChatSessionStream } from "@durable-streams/tanstack-ai-transport";
import {
  buildReadStreamUrl,
  getDurableChatSessionTarget,
  getDurableReadHeaders,
} from "~/lib/durable-streams";
import { buildV2ChatStreamPath } from "~/features/chat-v2/server/keys";

function normalizeChatId(id: string | null): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function forwardHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const [key, value] of response.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "connection" || lower === "transfer-encoding") continue;
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return headers;
}

export const Route = createFileRoute("/api/v2/chat-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incomingUrl = new URL(request.url);
        const chatId = normalizeChatId(incomingUrl.searchParams.get("id"));
        if (!chatId) {
          return Response.json(
            { error: "Missing or invalid chat id" },
            { status: 400 },
          );
        }

        const streamPath = buildV2ChatStreamPath(chatId);
        let upstreamUrl: URL;
        try {
          upstreamUrl = new URL(buildReadStreamUrl(streamPath));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Durable Streams unavailable";
          return Response.json({ error: message }, { status: 503 });
        }

        for (const [key, value] of incomingUrl.searchParams.entries()) {
          if (key === "id") continue;
          upstreamUrl.searchParams.append(key, value);
        }

        const accept = request.headers.get("accept");
        const readHeaders = getDurableReadHeaders();
        const fetchUpstream = () =>
          fetch(upstreamUrl, {
            method: "GET",
            headers: {
              ...(accept ? { Accept: accept } : {}),
              ...readHeaders,
            },
          });

        let upstream = await fetchUpstream();
        if (upstream.status === 404) {
          try {
            await ensureDurableChatSessionStream(
              getDurableChatSessionTarget(streamPath),
            );
            upstream = await fetchUpstream();
          } catch {
            // Continue and return upstream response.
          }
        }

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: forwardHeaders(upstream),
        });
      },
    },
  },
});
