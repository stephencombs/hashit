---
name: durable-streams
description: Durable Streams protocol and integration reference for resilient, resumable stream-based apps. Use when working with durable-streams, durable sessions, stream offsets or live reads, Durable State, StreamDB, Yjs sync, or TanStack AI and Vercel AI SDK transports.
---

# Durable Streams

This skill mirrors the Durable Streams docs reachable from `https://durablestreams.com/quickstart.md`.

Keep this top-level file as the entry point. Read only the smallest relevant sub-pages for the task so context stays lean.

## How to use

1. Start with `quickstart.md` for local setup or a protocol refresher.
2. Read `concepts.md` before changing offset, replay, live mode, or stream lifecycle behavior.
3. Load only the topic pages that match the task.
4. For exact wire-level rules, follow the upstream protocol/spec links embedded in the mirrored docs.

## Table of contents

### Getting started

- [`quickstart.md`](quickstart.md) - start a local server, create a stream, append data, read it, and tail it live
- [`concepts.md`](concepts.md) - protocol basics: streams, offsets, JSON mode, producers, consumers, live modes, lifecycle, caching
- [`deployment.md`](deployment.md) - Node dev server, Caddy plugin, auth, services, Docker, CDN notes
- [`benchmarking.md`](benchmarking.md) - benchmark package, latency and throughput metrics

### Structured data and collaboration

- [`json-mode.md`](json-mode.md) - structured JSON message streams
- [`durable-state.md`](durable-state.md) - typed state change events, control events, materialized state
- [`stream-db.md`](stream-db.md) - StreamDB on top of Durable State and TanStack DB
- [`yjs.md`](yjs.md) - Yjs provider/server sync, awareness, compaction, editor integrations

### AI integrations

- [`tanstack-ai.md`](tanstack-ai.md) - durable session transport for TanStack AI
- [`vercel-ai-sdk.md`](vercel-ai-sdk.md) - durable transport for AI SDK `useChat`

### Client and server implementation

- [`building-a-client.md`](building-a-client.md) - client behaviors, retries, idempotent producers, SSE, conformance tests
- [`building-a-server.md`](building-a-server.md) - server invariants, storage, optional features, conformance tests
- [`clients.md`](clients.md) - official client libraries across languages
- [`typescript-client.md`](typescript-client.md) - TypeScript client API and patterns
- [`python-client.md`](python-client.md) - Python client API and patterns

## Topic picker

- For stream semantics, offsets, EOF handling, SSE, long-polling, or caching: read `concepts.md`.
- For local setup, curl examples, or first integration work: read `quickstart.md` and `deployment.md`.
- For structured app data, shared state, or reactive collections: read `json-mode.md`, `durable-state.md`, and `stream-db.md`.
- For collaborative editors or CRDT syncing: read `yjs.md`.
- For durable AI chat/session work: read `tanstack-ai.md` and/or `vercel-ai-sdk.md`.
- For direct language APIs: read `typescript-client.md`, `python-client.md`, or `clients.md`.
- For implementing or validating protocol support: read `building-a-client.md`, `building-a-server.md`, and `benchmarking.md`.

## Source

Mirrored from `durablestreams.com` on 2026-04-20.
