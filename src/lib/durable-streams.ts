import { createError } from "evlog";
import { DurableStream } from "@durable-streams/client";
import type {
  DurableChatSessionStreamTarget,
  DurableStreamTarget,
} from "@durable-streams/tanstack-ai-transport";

function withProtocol(url: string): string {
  return url.includes("://") ? url : `http://${url}`;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function assertConfigured(url: string | undefined, name: string): string {
  if (!url) {
    throw createError({
      message: "Durable Streams endpoint not configured",
      status: 503,
      why: `Missing ${name} (or DURABLE_STREAMS_URL fallback) — the durable session transport cannot resolve a write/read URL.`,
      fix: "Start the local reference server via `pnpm dev:streams` or set DURABLE_STREAMS_URL / DURABLE_STREAMS_WRITE_URL / DURABLE_STREAMS_READ_URL in your environment.",
    });
  }
  return stripTrailingSlash(withProtocol(url));
}

function authHeader(
  token: string | undefined,
): { Authorization: string } | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function resolveWriteBase(): string {
  const shared = process.env.DURABLE_STREAMS_URL;
  const write = process.env.DURABLE_STREAMS_WRITE_URL ?? shared;
  return assertConfigured(write, "DURABLE_STREAMS_WRITE_URL");
}

function resolveReadBase(): string {
  const shared = process.env.DURABLE_STREAMS_URL;
  const read = process.env.DURABLE_STREAMS_READ_URL ?? shared;
  return assertConfigured(read, "DURABLE_STREAMS_READ_URL");
}

function resolveWriteHeaders(): { Authorization: string } | undefined {
  return authHeader(
    process.env.DURABLE_STREAMS_WRITE_TOKEN ??
      process.env.DURABLE_STREAMS_WRITE_BEARER_TOKEN,
  );
}

function resolveReadHeaders(): { Authorization: string } | undefined {
  return (
    authHeader(
      process.env.DURABLE_STREAMS_READ_TOKEN ??
        process.env.DURABLE_STREAMS_READ_BEARER_TOKEN,
    ) ?? resolveWriteHeaders()
  );
}

/**
 * Returns true when Durable Streams is configured and reachable via env.
 * Does not throw. Used by routes to choose between 503 fail-fast and normal flow.
 */
export function isDurableStreamsConfigured(): boolean {
  return Boolean(
    process.env.DURABLE_STREAMS_URL ??
    process.env.DURABLE_STREAMS_WRITE_URL ??
    process.env.DURABLE_STREAMS_READ_URL,
  );
}

/** Canonical stream path for chat sessions: `chat/<threadId>`. */
export function buildChatStreamPath(threadId: string): string {
  return `chat/${threadId}`;
}

function joinStreamUrl(base: string, streamPath: string): string {
  const cleanedPath = streamPath.replace(/^\/+/, "");
  return new URL(cleanedPath, `${base}/`).toString();
}

/** Write endpoint URL (server-side only) for a given stream path. */
export function buildWriteStreamUrl(streamPath: string): string {
  return joinStreamUrl(resolveWriteBase(), streamPath);
}

/** Read endpoint URL (server-side only) for a given stream path. */
export function buildReadStreamUrl(streamPath: string): string {
  return joinStreamUrl(resolveReadBase(), streamPath);
}

/** `DurableStreamTarget` for generic low-level writes. */
export function getDurableWriteTarget(streamPath: string): DurableStreamTarget {
  return {
    writeUrl: buildWriteStreamUrl(streamPath),
    headers: resolveWriteHeaders(),
    createIfMissing: true,
  };
}

/** Narrowed target used by `toDurableChatSessionResponse` / `ensureDurableChatSessionStream`. */
export function getDurableChatSessionTarget(
  streamPath: string,
): DurableChatSessionStreamTarget {
  return {
    writeUrl: buildWriteStreamUrl(streamPath),
    headers: resolveWriteHeaders(),
    createIfMissing: true,
  };
}

/** Headers required to read from upstream durable streams (server-side only). */
export function getDurableReadHeaders(): Record<string, string> | undefined {
  return resolveReadHeaders();
}

/**
 * Reads the current durable stream tail offset via HEAD.
 * Returns undefined when the stream exists but does not expose an offset.
 */
export async function readDurableStreamHeadOffset(
  streamPath: string,
): Promise<string | undefined> {
  const metadata = await DurableStream.head({
    url: buildReadStreamUrl(streamPath),
    headers: getDurableReadHeaders(),
  });
  return metadata.offset;
}
