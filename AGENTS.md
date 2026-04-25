## Learned User Preferences

- Keep explanations concise while still descriptive.
- For debugging and regressions, fix root causes rather than symptom patches.
- When implementing from an attached plan, do not edit the plan file, do not recreate todos, and progress existing todos sequentially to completion.
- For complex work, prefer a research-first flow: analyze, then plan, then implement.
- Do not commit or push changes unless explicitly requested in the current chat.
- Prefer minimal, local changes over introducing new abstractions when inline changes are sufficient.
- For V2 work, target V1 feature parity with net-new flows where useful; do not reuse existing V1 or V2 code just because it exists, and favor hard refactors over compatibility shims.
- Prefer package/framework-native solutions (TanStack Router, Query, DB, AI, and ai-elements) before adding custom code, and simplify aggressively.
- Prefer Router/Query/DB data-flow patterns over `useEffect` unless alternatives are exhausted.
- Prioritize native-feeling, instant UX and perceived performance.
- Never use `as any`; resolve type errors by refining or inferring types, and if unavoidable cast through `unknown` instead of deleting logic.
- Provide research-heavy or architecture-heavy deliverables as canvas artifacts instead of long chat responses.

## Learned Workspace Facts

- Stack: TanStack Start + Nitro + Vite (with React Server Components available in current Start versions), plus Drizzle/Postgres, TanStack AI, Azure OpenAI, and MCP tooling.
- Code is organized around `src/app`, `src/shared`, and `src/features/*`, with Drizzle schema split under `src/db/schema` behind stable `~/db/schema` imports.
- Local development runs at `hashit.localhost` via portless, with Docker Compose Azurite backing local prompt-attachment blob storage.
- Canonical deployment runs through `scripts/deploy.sh` (app + durable-streams images) followed by `terraform apply` in `infra/`; the deploy script caches the durable-streams server binary in `DURABLE_BINARY_CACHE_DIR`.
- App-wide `evlog`/OpenTelemetry observability was removed; do not reintroduce telemetry, logging, tracing, or observability plumbing unless explicitly requested.
- Durable Streams powers V2 chat session transport (`@durable-streams/tanstack-ai-transport`), with server helpers in `src/shared/lib/durable-streams.ts` and production `DURABLE_STREAMS_URL` wired from Terraform outputs.
- V2 chat is isolated under `src/features/chat-v2/` and `src/routes/v2*`, with `v2_threads`/`v2_messages` tables and `/api/v2/chat` + `/api/v2/chat-stream` endpoints.
- V2 server code is organized into `application/`, `runtime/`, `streams/`, `projection/`, `repositories/`, and `functions/`, exported through `src/features/chat-v2/server/index.ts`.
- V2 persistence is stream-first: `/api/v2/chat` awaits durable writes, then projects stream state into Postgres via `src/features/chat-v2/server/projection/projector.ts`; terminal custom events are emitted from `src/features/chat-v2/server/streams/events.ts`.
- V2 thread run/activity persistence and V2 file attachments were removed: no runtime `v2_thread_activity_events` status, V2 composer is text-only, and attachment-only V2 requests are rejected.
- Thread identity is route-driven: TanStack Router `threadId` params are the source of truth and the shared chat surface is keyed by route identity.
- V2 generative UI streams json-render events through `src/features/chat-v2/server/streams/json-render.ts`, rehydrates via `src/features/chat-v2/server/streams/spec-events.ts`, and persists interactive HITL `tool-result` state via submitted maps.
