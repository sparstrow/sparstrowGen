# Skeleton — usage notes

**Source:** `packages/ui/src/components/ui/skeleton.tsx`. Mirror mode. The whole
component is three lines: `animate-pulse rounded-md bg-muted` plus whatever
`className` you pass.

```tsx
<Skeleton className="h-4 w-[220px]" />
```

## Rules

- **Shape it like the content it stands in for.** A skeleton is a promise about
  what is arriving; a generic grey block promises nothing and the layout jumps
  when the real content lands.
- **Skeleton, not a spinner,** wherever the shape is knowable. A spinner says
  something is happening; a skeleton says what.
- **Match the row count you expect**, roughly. Three skeleton rows resolving
  into eleven is its own small jolt.

## Known limitation

`animate-pulse` is infinite and nothing in the app responds to
`prefers-reduced-motion` — verified 2026-08-19, no match anywhere in
`packages/ui/src` or `apps/web/src`. On a page full of skeletons that is a lot
of unstoppable motion for a user who asked for none.

Note this is also why a `pulsing-dot` slop finding on this file is a false
positive: the pulse here is a loading affordance, not an ambient decoration.
