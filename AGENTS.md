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

- When given a plan to implement, do not re-create todos (the user creates them before asking) and do not edit the plan file itself; just implement it and mark todos in-progress as you go.
- Strong preference for making the app feel native/instant; perceived performance is a top priority.
- Sidebar dead zones between items are a recurring concern — always fix with `::before` hit-area pseudo-elements; `overflow-hidden` on any ancestor clips these extensions.
- Animated icons (lucide-animated) must trigger on parent element hover, not on the icon directly.
- Research summaries and architectural artifacts should be delivered as canvas files rather than long chat responses.
- Prefers to plan before implementing; typical flow is: research → analyze project → create plan → "Implement the plan as specified".

## Learned Workspace Facts

- Stack: TanStack Start + Nitro + Vite, Drizzle/Postgres, TanStack AI + Azure OpenAI, MCP tools.
- UI components use shadcn with Radix UI base (`style: "vega"`, `base: "radix"` in `components.json`); migrated from Base UI.
- Tailwind v4; UI primitives live in `src/components/ui/`.
- `lucide-animated@1.0.0` installed; animated icon helper at `src/components/animated-icon.tsx`.
- All MCP tools use `lazy: true` via `mcpToolToServerTool` in `src/lib/mcp/tools.ts` to defer large schemas.
- SSR route loaders must call server functions — not relative `fetch('/api/...')` — because Node.js cannot resolve relative URLs.
- Duplicate artifact fetches were caused by `useEffect`; replaced with TanStack Query for deduplication and caching.
- Thread-switch full re-renders were caused by `key={threadId}` on `ChatProvider`; fixed by removing the key and resetting state internally on threadId change.
- Local dev URL is `hashit.localhost` (via portless proxy); user's browser is Zen (Firefox-based).
- json-render specs use `{"$state": "/keyname"}` bindings — actual row data lives in `spec.state`; `StateProvider` resolves `$state` references at render time.
- Streaming UI specs are tracked via `LiveSpecStore` (class-based external store, `src/lib/live-spec-store.ts`) with `useSyncExternalStore`; shallow Map copies on each update preserve stable array references for `React.memo` bail-outs.
