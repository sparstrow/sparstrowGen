# Empty — usage notes

**Source:** `packages/ui/src/components/ui/empty.tsx`. Mirror mode.

```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@sparstrow/ui";
```

Parts: `Empty` > `EmptyHeader` > `EmptyMedia` / `EmptyTitle` / `EmptyDescription`
> `EmptyContent`. `emptyMediaVariants` controls the icon frame.

## Rules

- **Never ship a bare "No items."** Copy says what this surface is for, and what
  to do to fill it.
- **The action goes in `EmptyContent`, on this screen.** A description telling
  the user to go elsewhere is half a state.
- **Empty is not error.** Nothing here yet, versus we could not load it. An
  empty state shown after a failed fetch is a lie the user acts on.
- **Empty is not loading.** Use `Skeleton` while data is in flight; an empty
  state that flashes before data arrives reads as data loss.

## Where it belongs

Every list, table, and panel — no exceptions. A surface with only its populated
state is not finished. This is enforced by the four-states requirement in the
`frontend-wiring` skill and graded in every task's definition of done.
