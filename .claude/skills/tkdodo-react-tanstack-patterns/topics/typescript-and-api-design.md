# TypeScript and API Design

## Type Inference First

- Let `queryFn` return types drive `useQuery` inference.
- Avoid unnecessary generic annotations that can widen types or fight inference.
- Prefer JavaScript-like usage with strong inferred boundaries.

## Runtime Validation Boundaries

- TypeScript types do not validate runtime payloads.
- For untrusted APIs, validate at boundaries (for example with schema validation) before caching data.

## Query Abstraction Pitfalls

- Avoid accepting broad `UseQueryOptions` shapes in wrappers unless carefully constrained.
- Naive option spreading can widen `data` to `unknown`.
- Prefer small query factory functions that return complete options.

## API Surface Design

- Avoid boolean parameters when the behavior space can grow.
- Prefer discriminated unions or explicit mode objects.
- Keep naming consistent and intention-revealing.

## Common Type Safety Traps

- Avoid leaking `any` from third-party integrations or incomplete typings.
- Distinguish optional properties from explicit `undefined` when modeling external contracts.
- Use exhaustive checks for union-driven control flow.

## Practical Checklist

- [ ] Inference comes from typed query functions
- [ ] Runtime validation exists at API boundaries
- [ ] Query abstractions preserve `data` type precision
- [ ] Public APIs avoid boolean ambiguity
- [ ] Union flows are exhaustive and `any` leaks are blocked
