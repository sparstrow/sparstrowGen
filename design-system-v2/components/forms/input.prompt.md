# Input — usage notes

**Source:** `packages/ui/src/components/ui/input.tsx`. Mirror mode.

```tsx
<Input placeholder="workshop-desktop" aria-invalid={!!error} />
```

## Rules

- **Always label it.** Use `Label` with `htmlFor`, or `aria-label` when the
  design genuinely has no room. A placeholder is not a label: it disappears
  exactly when the user needs it, and fails every accessibility check.
- **Error state is `aria-invalid`,** not a red border added at the call site.
  The component styles the invalid state; a hand-added border is not announced
  to a screen reader.
- **Say what is wrong, below the field, in words.** A red outline alone tells
  the user something is wrong, not what.
- **Derive validation from the Zod schema** that already defines the contract,
  rather than hand-rolling a parallel check that can drift from it. See the
  `frontend-wiring` skill.

## Gap

There is no `InputGroup`, no prefix/suffix slot, and no built-in error text
element. Forms that need those compose them at the call site today, which is
why field spacing varies between screens.
