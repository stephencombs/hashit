# Design System and Accessibility

## API Design Principles

- Prefer composition over boolean-prop proliferation.
- Keep component APIs consistent and predictable.
- Provide one clear way to solve common tasks.

## Compound Components

- Use compound components where layout/content composition is the main axis.
- Keep them type-safe and explicit about slot expectations.
- If composition becomes awkward, prefer simpler prop APIs.

## Tooltip and Info Patterns

- Do not rely on hover-only tooltip behavior for essential information.
- Ensure keyboard accessibility and focusability.
- Prefer explicit info-text/info-button patterns for contextual help.

## Testing Approach

- Prefer role/name/label selectors over `data-testid`.
- Use semantic HTML to get robust accessible roles by default.
- Keyboard navigation checks should be part of baseline QA.

## Practical Checklist

- [ ] API avoids boolean explosion
- [ ] Composition model is type-safe and discoverable
- [ ] Interaction patterns work with keyboard, not only mouse
- [ ] Tests query behavior through accessible roles/names
- [ ] Semantic HTML is preferred over ad-hoc ARIA patching
