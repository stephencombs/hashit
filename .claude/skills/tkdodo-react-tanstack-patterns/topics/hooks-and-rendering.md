# Hooks and Rendering Patterns

## Effect Discipline

- Write fewer effects.
- Keep each effect single-purpose.
- Avoid effects that synchronize React state with React state.
- Use effects for synchronization with external systems (DOM APIs, storage, subscriptions).

## Stale Closures and Dependencies

- Treat exhaustive-deps as a correctness tool, not style noise.
- Do not lie about dependencies.
- Prefer patterns that eliminate problematic dependencies instead of suppressing lint rules.

## Callback Refs vs Effects

- For node lifecycle work (focus, measure, imperative setup), prefer callback refs.
- For non-node side effects (`document.title`, analytics), use regular effects.

## Memoization Strategy

- Do not start with `useCallback`/`useMemo`/`React.memo` everywhere.
- First optimize composition and state locality to avoid rendering broad subtrees.
- Add memoization only when you can identify a bottleneck.

## State Modeling

- Keep state minimal and derived whenever possible.
- Use functional updates when next state depends on previous state.
- Use `useReducer` when multiple values update together and actions model intent.
- For one-time expensive initialization, use lazy `useState` initializer functions.

## Hydration and SSR Edge Cases

- Use `useSyncExternalStore` patterns when SSR/client snapshots diverge.
- Avoid papering over mismatches without understanding source-of-truth timing.

## Practical Checklist

- [ ] Effects are external-sync only
- [ ] Dependency arrays are truthful
- [ ] Callback refs used for node lifecycle work
- [ ] Memoization added only after identifying hot paths
- [ ] State shape favors derivation over duplication
- [ ] Hydration strategy is explicit for mixed SSR/client values
