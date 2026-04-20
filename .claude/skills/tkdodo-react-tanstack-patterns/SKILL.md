---
name: tkdodo-react-tanstack-patterns
description: Applies TkDodo React and TanStack best-practice patterns for Query, Router, hooks, forms, accessibility, and API design. Use when building, reviewing, or refactoring React code that uses TanStack Query or TanStack Router, or when debugging stale state, invalidation, rerender performance, hydration, and useEffect misuse.
---

# TkDodo React + TanStack Patterns

This file is a table of contents. Read only the topic files that match the task.

## Topic Index

| Topic | Use when | File |
| --- | --- | --- |
| Query foundations | Defining query keys, query options, status handling, data transforms, cache behavior | [topics/query-foundations.md](./topics/query-foundations.md) |
| Mutations and invalidation | Mutation workflows, optimistic updates, rollback, cancellation, cache invalidation | [topics/mutations-and-invalidation.md](./topics/mutations-and-invalidation.md) |
| Forms and derived client state | Editing server-backed forms, avoiding sync effects, preserving background updates | [topics/forms-and-derived-state.md](./topics/forms-and-derived-state.md) |
| Hooks and rendering patterns | Reducing unnecessary effects, stale closure avoidance, memoization strategy, refs, hydration | [topics/hooks-and-rendering.md](./topics/hooks-and-rendering.md) |
| TanStack Router integration | Loader + cache cooperation, route context, fine-grained subscriptions | [topics/tanstack-router-integration.md](./topics/tanstack-router-integration.md) |
| Design system and a11y patterns | Component API ergonomics, keyboard-first behavior, semantic testing | [topics/design-system-and-a11y.md](./topics/design-system-and-a11y.md) |
| TypeScript and API design | Type inference, query abstractions, union modeling, safe boundaries | [topics/typescript-and-api-design.md](./topics/typescript-and-api-design.md) |
| Source index | Direct article links grouped by area for deeper research | [topics/source-index.md](./topics/source-index.md) |

## Quick Routing

If the task is primarily:

- Query correctness, caching, stale data, invalidation -> read `query-foundations` and `mutations-and-invalidation`.
- Form editing over server data -> read `forms-and-derived-state`.
- Render performance, memoization, effect cleanup, stale closures -> read `hooks-and-rendering`.
- Route loaders/search params/context -> read `tanstack-router-integration`.
- Component API shape, accessibility, testing style -> read `design-system-and-a11y`.
- Type safety and abstraction boundaries -> read `typescript-and-api-design`.
