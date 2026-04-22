<!-- intent-skills:start -->
# Skill mappings - when working in these areas, load the linked skill file into context.
skills:
  - task: "Building or debugging streaming chat UX and responses"
    load: "node_modules/@tanstack/ai/skills/ai-core/chat-experience/SKILL.md"
  - task: "Adding or changing AI tools (MCP/form/plan tools)"
    load: "node_modules/@tanstack/ai/skills/ai-core/tool-calling/SKILL.md"
  - task: "Adding telemetry/logging/hooks around AI runs"
    load: "node_modules/@tanstack/ai/skills/ai-core/middleware/SKILL.md"
  - task: "Editing TanStack Start app structure and route integration"
    load: "node_modules/@tanstack/react-start/skills/react-start/SKILL.md"
  - task: "Server/runtime request handling and deployment behavior"
    load: "node_modules/nitro/skills/nitro/SKILL.md"
<!-- intent-skills:end -->

## Learned User Preferences

- When given a plan to implement, do not re-create todos and do not edit the plan file; implement it directly, move existing todos to in progress in order, and continue until all are completed.
- Prefers a research-first planning flow for complex work: analyze first, then plan, then implement.
- Do not commit or push changes unless explicitly approved by the user in that chat.
- Before finalizing implementation, run a concise review against applicable local skills and AGENTS guidance, prioritized by severity with concrete fixes.
- Prefer minimal, local fixes over introducing new abstractions when an inline change is sufficient.
- Strong preference for making the app feel native and instant; perceived performance is a top priority.
- Sidebar dead zones between items should be fixed with `::before` hit-area pseudo-elements; ancestor `overflow-hidden` clips those extensions.
- Animated icons (`lucide-animated`) should trigger on parent hover, not icon hover.
- Prompt attachments should be Discord-style: selecting files queues visible previews and they send only on manual submit.
- Research summaries and architecture-heavy deliverables should be provided as canvas artifacts instead of long chat responses.
- For debugging and regressions, prioritize root-cause fixes over symptom patches; avoid forced component `key` resets; for V2, build net-new flows (no V1 code reuse) and prefer Router/Query/DB data-flow patterns over `useEffect` unless alternatives are exhausted.
- For TanStack DB state, prefer native `@tanstack/react-db` hooks (for example `useLiveQuery`) instead of wrapping state with `useSyncExternalStore`.
- Optimistically bump a thread to the top of the sidebar thread list when the user sends a message in it.
- For deploy-time configuration (container env vars, service URLs), wire from Terraform outputs rather than hardcoding values.

## Learned Workspace Facts

- Stack: TanStack Start + Nitro + Vite with Drizzle/Postgres, TanStack AI, Azure OpenAI, and MCP tools.
- Durable Streams: chat sessions use `@durable-streams/tanstack-ai-transport`. Local dev runs `@durable-streams/server` on `DURABLE_STREAMS_URL` (default `http://localhost:4437`) via `pnpm dev:streams` (started automatically by `pnpm dev`). Production deploys a separate Azure Container App (`${app_name}-durable-streams`) from `Dockerfile.durable-streams`, backed by Azure Files, and the app receives `DURABLE_STREAMS_URL=http://<durable-streams-app>.internal.<container-app-env-domain>/v1/stream` from Terraform. Server-side write/read helpers live in [src/lib/durable-streams.ts](src/lib/durable-streams.ts). Stream keying: `chat/<threadId>`. If the URL is unset, `/api/chat` and `/api/chat-stream` fail fast with 503 and the client surfaces it through `submissionError`. Postgres rows in `messages` are the long-term archive (used when the durable stream has rolled past TTL); the durable stream is the live source of truth during a session.
- UI uses shadcn with Radix (`style: "vega"`, `base: "radix"` in `components.json`) plus Tailwind v4; primitives live in `src/components/ui/`.
- Local dev runs at `hashit.localhost` via portless.
- MCP tool wiring defaults to `lazy: true`; TanStack AI lazy discovery requires allowing `__lazy__tool__discovery__` in tool-call policy.
- SSR route loaders must call server functions directly instead of relative `fetch('/api/...')` calls, since Node cannot resolve relative URLs.
- json-render uses `{"$state": "/key"}` bindings that resolve against `spec.state` through `StateProvider`.
- Streaming UI specs are managed by `LiveSpecStore` (`useSyncExternalStore` + shallow Map copies) to preserve stable refs for memoized rows.
- Thread routing uses TanStack Router params as the source of truth for chat identity: the thread route renders the shared `Chat` surface keyed by route `threadId`, `chat-context` has been removed, and the old virtualized conversation path is not used.
- V2 chat is isolated under `src/features/chat-v2/` and `src/routes/v2*`, with separate `v2_threads`/`v2_messages` tables in `src/db/schema.ts` and dedicated `/api/v2/chat` + `/api/v2/chat-stream` endpoints.
- Interactive HITL tools follow a shared pattern: `resolve_duplicate_entity` mirrors `collect_form_data`, stream stops for user input, submitted maps rehydrate from persisted `tool-result` parts via `buildSubmittedMaps`, and TanStack AI `needsApproval`/`addToolApprovalResponse` currently supports approve/deny only (editable payload flows still use custom HITL with `addToolResult`).
- Date fields use shadcn `Popover` + `Calendar` composition rather than native date inputs.
- New-chat → thread transition navigates for real to `/chat/$threadId` after `persistence_complete`, priming `threadDetailQuery` + `artifactsByThreadQuery` caches to avoid a skeleton flash. Sidebar selected state is driven by `matchRoute` / `<Link>` active state only — no route masking. `__newChatNavNonce` remains (separate concern: force-resets the `Chat` surface when "New Chat" is clicked while already on `/`). `collect_form_data` drafts persist under `hashit:form-draft:<toolCallId>`.
- Canonical deploy path is `scripts/deploy.sh`: builds and pushes both `hashit` and `durable-streams` images to ACR, then runs `terraform apply` against `infra/`. Azure resource group is `scombs-dev`.

## Durable Streams Production Checklist

- Build and push two images to ACR for each release: `${app_name}:${image_tag}` and `${durable_streams_image_name}:${durable_streams_image_tag}`.
- Set Terraform vars for durable streams image + storage (`durable_streams_image_name`, `durable_streams_image_tag`, `durable_streams_file_share_*`) before `terraform apply`.
- After deploy, verify `DURABLE_STREAMS_URL` is set on the main app container and points to the internal durable-streams service with `/v1/stream`.
- Smoke test via app API: create a thread (`POST /api/threads`), send a chat turn (`POST /api/chat?id=<threadId>`), and tail updates (`GET /api/chat-stream?id=<threadId>&live=sse`).
- If chats fail to resume, check durable-streams container health, Azure Files mount, and whether the file share is reachable in the Container App environment.
