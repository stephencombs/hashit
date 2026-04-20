# TanStack Router Integration

## Router + Query Responsibilities

- Router controls navigation and route lifecycle.
- Query controls async cache/state.
- Do not treat router loaders as a cache replacement.

## Loader Integration Pattern

- Fetch early in loaders using `QueryClient` helpers.
- Return cache-backed data from loaders when possible.
- On actions/mutations, invalidate relevant query keys so route data reflects fresh cache.

## Subscription Granularity

- Use selectors and narrower subscriptions to avoid route-wide rerenders.
- Avoid reading large route/search objects in deep performance-sensitive subtrees.

## Route Context and Search Params

- Use route context for explicit dependency injection and shared route-scoped data.
- Keep URL search params meaningful and avoid polluting URLs with redundant defaults.

## Practical Checklist

- [ ] Loader flow and Query cache flow are coordinated
- [ ] Action handlers trigger proper invalidation
- [ ] Subscriptions are scoped to required route/search slices
- [ ] Route context usage is explicit and typed
- [ ] Search param defaults are intentional and clean
