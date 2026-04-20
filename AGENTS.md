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

- When given a plan to implement, do not re-create todos and do not edit the plan file; implement it directly and mark existing todos in progress while working.
- Prefers a research-first planning flow for complex work: analyze first, then plan, then implement.
- Before finalizing implementation, run a concise review against applicable local skills and AGENTS guidance, prioritized by severity with concrete fixes.
- Prefer minimal, local fixes over introducing new abstractions when an inline change is sufficient.
- Strong preference for making the app feel native and instant; perceived performance is a top priority.
- Sidebar dead zones between items should be fixed with `::before` hit-area pseudo-elements; ancestor `overflow-hidden` clips those extensions.
- Animated icons (`lucide-animated`) should trigger on parent hover, not icon hover.
- Prompt attachments should be Discord-style: selecting files queues visible previews and they send only on manual submit.
- Research summaries and architecture-heavy deliverables should be provided as canvas artifacts instead of long chat responses.
- For debugging and regressions, prioritize root-cause diagnosis and fixes over symptom-level patches.

## Learned Workspace Facts

- Stack: TanStack Start + Nitro + Vite with Drizzle/Postgres, TanStack AI, Azure OpenAI, and MCP tools.
- UI uses shadcn with Radix (`style: "vega"`, `base: "radix"` in `components.json`) plus Tailwind v4; primitives live in `src/components/ui/`.
- Local dev runs at `hashit.localhost` via portless.
- MCP tool wiring defaults to `lazy: true`; TanStack AI lazy discovery requires allowing `__lazy__tool__discovery__` in tool-call policy.
- SSR route loaders must call server functions directly instead of relative `fetch('/api/...')` calls, since Node cannot resolve relative URLs.
- json-render uses `{"$state": "/key"}` bindings that resolve against `spec.state` through `StateProvider`.
- Streaming UI specs are managed by `LiveSpecStore` (`useSyncExternalStore` + shallow Map copies) to preserve stable refs for memoized rows.
- Chat rendering regressions were fixed by removing `key={threadId}` remount behavior and replacing effect-driven artifact fetches with TanStack Query dedupe/caching.
- Interactive HITL tools follow a shared pattern: `resolve_duplicate_entity` mirrors `collect_form_data`, stream stops for user input, and submitted maps rehydrate from persisted `tool-result` parts via `buildSubmittedMaps`.
- TanStack AI `needsApproval`/`addToolApprovalResponse` supports approve/deny only; editable payload flows still use custom HITL with `addToolResult`.
- Date fields use shadcn `Popover` + `Calendar` composition rather than native date inputs.
- New-chat behavior uses TanStack Router masking (`mask`, `maskedLocation`, `unmaskOnReload`) with `__newChatNavNonce` resets, and `collect_form_data` drafts persist under `hashit:form-draft:<toolCallId>`.
