# Mutations and Invalidation

## Mutation Defaults

- Default to invalidation for correctness.
- Only use direct cache writes (`setQueryData`) when you fully understand data shape implications.
- Keep mutation side effects centralized and explicit.

## Invalidation Strategy

- Broad invalidation is often an acceptable first implementation.
- Narrow invalidation later with key hierarchy and mutation metadata when needed.
- An invalidation does not always mean immediate refetch; it marks data stale.

## Optimistic Updates

Use this sequence:

1. Cancel potentially conflicting queries
2. Snapshot previous cache value
3. Apply optimistic cache update
4. Roll back on error
5. Invalidate on settle

Guidelines:

- Optimistic updates are best for high-frequency UX paths.
- Keep optimistic logic close to server semantics.
- Avoid optimistic updates when reconciliation logic is unclear or high risk.

## Concurrency and Consistency

- Protect against "window of inconsistency" by canceling in-flight reads before optimistic writes.
- Be careful with concurrent mutations against the same entity.
- Prefer idempotent server operations where possible.

## Infinite and Paginated Data

- Understand page structure before manual cache edits.
- Invalidating query families is often safer than piecemeal page manipulation.

## Network and Offline Modes

- Choose `networkMode` intentionally (`online`, `always`, `offlineFirst`) based on behavior requirements.
- Distinguish between "no data yet" and "paused/refetching" states in UI.

## Practical Checklist

- [ ] Invalidation plan is explicit
- [ ] Mutation side effects are scoped and predictable
- [ ] Optimistic path has cancel/snapshot/rollback/invalidate
- [ ] Concurrent mutation behavior is tested
- [ ] Loading/error states match network mode semantics
