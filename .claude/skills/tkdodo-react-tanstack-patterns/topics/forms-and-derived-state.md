# Forms and Derived Client State

## Primary Principle

- Do not sync server state into client state by default.
- Derive what you can from query data and local user intent.

## Server-Backed Forms

- Keep server state and draft client state separate.
- Prefer representing client edits as "delta" over server data instead of full copied state.
- Keep background updates on when possible; untouched fields should still reflect server updates.

## Derivation Pattern

- Start from server value.
- Overlay user edits for touched fields.
- Compute rendered value from `derived = localOverride ?? serverValue`.

This prevents stale copied snapshots and keeps synchronization logic simple.

## Submission UX

- Use mutation pending state to prevent duplicate submissions.
- Disable primary submit action while mutation is running.
- Keep optimistic behavior explicit per field/form type.

## Props-to-State Cases

- Avoid effect-based "sync props into state" in most cases.
- Prefer:
  - conditional rendering/lifting state, or
  - key-based remount for intentionally resettable local drafts.

## Practical Checklist

- [ ] No unnecessary server-data copy into local state
- [ ] Derived value strategy is explicit
- [ ] Background updates still apply to untouched fields
- [ ] Submit deduping via mutation pending state
- [ ] Reset behavior avoids sync-effect anti-patterns
