## Learned User Preferences

- Keep explanations concise while still descriptive.
- For debugging and regressions, fix root causes rather than symptom patches.
- When implementing from an attached plan, do not edit the plan file, do not recreate todos, and progress existing todos sequentially to completion.
- For complex work, prefer a research-first flow: analyze, then plan, then implement.
- Do not commit or push changes unless explicitly requested in the current chat.
- Prefer minimal, local changes over introducing new abstractions when inline changes are sufficient.
- For V2 work, build net-new flows and avoid reusing V1 code paths; favor hard refactors over backward-compatibility shims.
- Prefer package/framework-native solutions (TanStack Router, Query, DB, AI, and ai-elements) before adding custom code, and simplify aggressively.
- Prefer Router/Query/DB data-flow patterns over `useEffect` unless alternatives are exhausted.
- Prioritize native-feeling, instant UX and perceived performance.
- Never use `as any`; resolve type errors by refining or inferring types, and if unavoidable cast through `unknown` instead of deleting logic.
- Provide research-heavy or architecture-heavy deliverables as canvas artifacts instead of long chat responses.

## Learned Workspace Facts

- Stack: TanStack Start + Nitro + Vite (with React Server Components available in current Start versions), plus Drizzle/Postgres, TanStack AI, Azure OpenAI, and MCP tooling.
- Local development runs at `hashit.localhost` via portless.
- Durable Streams powers chat session transport (`@durable-streams/tanstack-ai-transport`), with server helpers in `src/lib/durable-streams.ts` and production `DURABLE_STREAMS_URL` wired from Terraform outputs.
- V2 chat is isolated under `src/features/chat-v2/` and `src/routes/v2*`, with `v2_threads`/`v2_messages` tables and `/api/v2/chat` + `/api/v2/chat-stream` endpoints.
- V2 persistence is stream-first: `/api/v2/chat` awaits durable writes, then projects stream state into Postgres via `src/features/chat-v2/server/stream-projection.ts`; terminal custom events are emitted by `src/features/chat-v2/server/persistence-runtime.ts`.
- Thread activity status sync uses atomic thread run-state transitions plus durable event logging in `v2_thread_activity_events`, streamed through `/api/v2/thread-events` and consumed by `use-v2-thread-activity-sync`.
- Thread identity is route-driven: TanStack Router `threadId` params are the source of truth and the shared chat surface is keyed by route identity.
- V2 generative UI streams json-render events (`spec_patch`/`spec_complete`) through `src/features/chat-v2/server/json-render-events.ts` and rehydrates via `src/features/chat-v2/server/durable-spec-events.ts`.
- Conversation anchoring supports user-top behavior via `ConversationInitialAnchor` (`message-top`) while streaming still autoscrolls with new assistant output.
- Interactive HITL tools persist and rehydrate `tool-result` state via submitted maps; TanStack AI `needsApproval` currently supports approve/deny only.
- Date fields are implemented with shadcn `Popover` + `Calendar` composition instead of native date inputs.
- Canonical deployment runs through `scripts/deploy.sh` (app + durable-streams images) followed by `terraform apply` in `infra/` with resource group `scombs-dev`.
