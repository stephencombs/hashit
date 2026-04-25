import { createFileRoute } from "@tanstack/react-router";
import {
  getLatestV2ThreadActivityEventId,
  listV2ThreadActivityEventsAfter,
  type V2ThreadActivityEventRecord,
} from "~/features/chat-v2/server/thread-activity-events.server";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 15_000;
const TAIL_POLL_INTERVAL_MS = 1_000;
const REPLAY_BATCH_SIZE = 200;
const LIVE_BATCH_SIZE = 200;

type V2ThreadEventSubscriber = {
  id: number;
  cursor: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
  readyForLive: boolean;
  closed: boolean;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
};

type V2ThreadEventHubState = {
  subscribers: Map<number, V2ThreadEventSubscriber>;
  nextSubscriberId: number;
  tailRunning: boolean;
  tailPolling: boolean;
  tailCursor: number;
  tailTimer: ReturnType<typeof setTimeout> | null;
};

const v2ThreadEventHub: V2ThreadEventHubState = {
  subscribers: new Map(),
  nextSubscriberId: 1,
  tailRunning: false,
  tailPolling: false,
  tailCursor: 0,
  tailTimer: null,
};

function parseCursor(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function toSseEvent(event: V2ThreadActivityEventRecord): string {
  return [
    `id: ${event.id}`,
    `event: ${event.eventType}`,
    `data: ${JSON.stringify({
      threadId: event.threadId,
      at: event.occurredAt.toISOString(),
    })}`,
    "",
    "",
  ].join("\n");
}

function removeSubscriber(subscriberId: number): void {
  const subscriber = v2ThreadEventHub.subscribers.get(subscriberId);
  if (!subscriber) return;
  subscriber.closed = true;
  if (subscriber.heartbeatTimer) {
    clearInterval(subscriber.heartbeatTimer);
    subscriber.heartbeatTimer = null;
  }
  v2ThreadEventHub.subscribers.delete(subscriberId);
  try {
    subscriber.controller.close();
  } catch {
    // already closed
  }
  if (v2ThreadEventHub.subscribers.size === 0) {
    v2ThreadEventHub.tailRunning = false;
    if (v2ThreadEventHub.tailTimer) {
      clearTimeout(v2ThreadEventHub.tailTimer);
      v2ThreadEventHub.tailTimer = null;
    }
  }
}

function emitEventToSubscriber(
  subscriber: V2ThreadEventSubscriber,
  event: V2ThreadActivityEventRecord,
): void {
  if (subscriber.closed) return;
  if (event.id <= subscriber.cursor) return;
  try {
    subscriber.controller.enqueue(encoder.encode(toSseEvent(event)));
    subscriber.cursor = event.id;
  } catch {
    removeSubscriber(subscriber.id);
  }
}

async function replayEventsToSubscriber(
  subscriber: V2ThreadEventSubscriber,
  upToId: number,
): Promise<void> {
  while (!subscriber.closed && subscriber.cursor < upToId) {
    const events = await listV2ThreadActivityEventsAfter({
      afterId: subscriber.cursor,
      upToId,
      limit: REPLAY_BATCH_SIZE,
    });
    if (events.length === 0) return;
    for (const event of events) {
      emitEventToSubscriber(subscriber, event);
      if (subscriber.closed) return;
    }
    if (events.length < REPLAY_BATCH_SIZE) return;
  }
}

async function pollTailOnce(): Promise<void> {
  if (!v2ThreadEventHub.tailRunning || v2ThreadEventHub.tailPolling) return;
  v2ThreadEventHub.tailPolling = true;
  try {
    const events = await listV2ThreadActivityEventsAfter({
      afterId: v2ThreadEventHub.tailCursor,
      limit: LIVE_BATCH_SIZE,
    });
    if (events.length > 0) {
      v2ThreadEventHub.tailCursor = events[events.length - 1].id;
      for (const event of events) {
        for (const subscriber of v2ThreadEventHub.subscribers.values()) {
          if (!subscriber.readyForLive) continue;
          emitEventToSubscriber(subscriber, event);
        }
      }
    }
  } finally {
    v2ThreadEventHub.tailPolling = false;
    if (v2ThreadEventHub.tailRunning && !v2ThreadEventHub.tailTimer) {
      v2ThreadEventHub.tailTimer = setTimeout(() => {
        v2ThreadEventHub.tailTimer = null;
        void pollTailOnce();
      }, TAIL_POLL_INTERVAL_MS);
    }
  }
}

function ensureTailingStarted(): void {
  if (v2ThreadEventHub.tailRunning) return;
  v2ThreadEventHub.tailRunning = true;
  if (!v2ThreadEventHub.tailTimer) {
    v2ThreadEventHub.tailTimer = setTimeout(() => {
      v2ThreadEventHub.tailTimer = null;
      void pollTailOnce();
    }, TAIL_POLL_INTERVAL_MS);
  }
}

export function resetV2ThreadEventsStateForTests(): void {
  for (const subscriber of v2ThreadEventHub.subscribers.values()) {
    subscriber.closed = true;
    if (subscriber.heartbeatTimer) {
      clearInterval(subscriber.heartbeatTimer);
      subscriber.heartbeatTimer = null;
    }
    try {
      subscriber.controller.close();
    } catch {
      // ignore
    }
  }
  v2ThreadEventHub.subscribers.clear();
  if (v2ThreadEventHub.tailTimer) {
    clearTimeout(v2ThreadEventHub.tailTimer);
  }
  v2ThreadEventHub.tailTimer = null;
  v2ThreadEventHub.tailRunning = false;
  v2ThreadEventHub.tailPolling = false;
  v2ThreadEventHub.tailCursor = 0;
  v2ThreadEventHub.nextSubscriberId = 1;
}

export const Route = createFileRoute("/api/v2/thread-events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const cursorFromHeader = parseCursor(
          request.headers.get("Last-Event-ID"),
        );
        const cursorFromQuery = parseCursor(
          requestUrl.searchParams.get("after"),
        );
        const initialCursor = Math.max(cursorFromHeader, cursorFromQuery);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const subscriberId = v2ThreadEventHub.nextSubscriberId++;
            const subscriber: V2ThreadEventSubscriber = {
              id: subscriberId,
              cursor: initialCursor,
              controller,
              readyForLive: false,
              closed: false,
              heartbeatTimer: null,
            };
            v2ThreadEventHub.subscribers.set(subscriberId, subscriber);

            const stop = () => {
              removeSubscriber(subscriberId);
              request.signal.removeEventListener("abort", stop);
            };
            request.signal.addEventListener("abort", stop, { once: true });
            subscriber.heartbeatTimer = setInterval(() => {
              if (subscriber.closed) return;
              try {
                controller.enqueue(
                  encoder.encode(`: keepalive ${Date.now()}\n\n`),
                );
              } catch {
                stop();
              }
            }, HEARTBEAT_INTERVAL_MS);

            void (async () => {
              try {
                const replayToId = await getLatestV2ThreadActivityEventId();
                await replayEventsToSubscriber(subscriber, replayToId);
                if (subscriber.closed) return;
                subscriber.readyForLive = true;
                if (replayToId > v2ThreadEventHub.tailCursor) {
                  v2ThreadEventHub.tailCursor = replayToId;
                }
                ensureTailingStarted();
              } catch {
                stop();
              }
            })();
          },
          cancel() {
            // cancel() is invoked when the consumer stops reading.
            // Cleanup is driven by request abort and removeSubscriber.
          },
        });

        return new Response(stream, {
          headers: {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream",
          },
        });
      },
    },
  },
});
