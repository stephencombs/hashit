# Query Foundations

## Core Mental Model

- Treat TanStack Query as **server state management**, not client state storage.
- Keep client-only UI state separate (modal state, local filters, draft inputs).
- Avoid copying query data into local state unless you are intentionally creating editable draft state.

## Query Keys

- Treat query keys like dependency arrays: every variable that influences data must be in the key.
- Prefer array/object keys with a clear hierarchy for invalidation.
- Use key/query factories so keys and query functions stay close and type-safe.
- Avoid ad-hoc string keys and partially matching keys you cannot reason about.

## Query Options and Abstractions

- Prefer `queryOptions(...)`/factory functions over broad custom wrappers around `useQuery`.
- Keep abstractions thin and inference-friendly.
- Avoid abstractions that require manually specifying many generics.
- Do not centralize keys too far away from the query function that consumes them.

## Status and Rendering

- Handle stale-while-revalidate correctly: `data` and `error` can exist together.
- Prefer data-first rendering with background error indicators when stale data is usable.
- Avoid binary "error OR data" assumptions.

## Data Transformation Placement

Use this order by default:

1. Backend (best when possible)
2. `queryFn` transformation
3. `select` for consumer-specific slices
4. Render-time transformation as last resort

Guideline:

- Use `select` for subscription narrowing and projection.
- Keep expensive transforms stable when using `select` to avoid needless recomputation.

## Cache Behavior Defaults

- Tune `staleTime` per use case before disabling refetch behaviors.
- Remember: fresh data is served from cache without network calls.
- Keep a stable `QueryClient` instance for the app lifecycle.

## Practical Checklist

- [ ] Query key contains every data-shaping input
- [ ] Key structure supports targeted invalidation
- [ ] Query abstraction preserves type inference
- [ ] UI accounts for stale data + background errors
- [ ] Transform location is intentional and documented
