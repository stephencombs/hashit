import { createFileRoute } from "@tanstack/react-router";
import { ensureDurableChatSessionStream } from "@durable-streams/tanstack-ai-transport";
import {
  buildChatStreamPath,
  buildReadStreamUrl,
  getDurableChatSessionTarget,
  getDurableReadHeaders,
} from "~/lib/durable-streams";

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

export const Route = createFileRoute("/api/chat-stream")({
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

        const streamPath = buildChatStreamPath(chatId);
        let upstreamUrl: URL;
        try {
          upstreamUrl = new URL(buildReadStreamUrl(streamPath));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Durable Streams unavailable";
          return Response.json(
            { error: message },
            { status: 503 },
          );
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
              ...(readHeaders ?? {}),
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
            // Fall through and return the original upstream response.
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
