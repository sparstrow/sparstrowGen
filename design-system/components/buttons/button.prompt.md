# Button — usage notes

**Source:** `packages/ui/src/components/ui/button.tsx`. Mirror mode — this card
documents that file, it does not reimplement it.

```tsx
import { Button } from "@sparstrow/ui";
<Button variant="destructive" size="sm">Delete</Button>
```

## Choosing a variant

| Variant | Use for | Not for |
|---|---|---|
| `default` | The one primary action on a surface | Two of them on the same screen |
| `secondary` | A real alternative to the primary action | Anything destructive |
| `outline` | Actions in a toolbar or row where none dominates | The main call to action |
| `ghost` | Dense rows and icon actions, where a border would add noise | Anything the user must find quickly |
| `destructive` | Delete, revoke, stop — irreversible or disruptive | Merely "cancel" |
| `link` | Navigation dressed as text | Anything that mutates state |

## Rules

- **One `default` per surface.** More than one and neither reads as primary.
- **`asChild` for navigation.** Wrapping a `Link` in a Button breaks keyboard
  and middle-click behaviour; `asChild` keeps the anchor semantics.
- **`size="icon"` needs an accessible name.** It has no text, so pass
  `aria-label`. An icon button with no label is invisible to a screen reader.
- **Never restyle a variant at the call site.** A `className` that changes the
  background is a new variant that only exists on one screen — add it to
  `button.tsx` or use an existing one.
- **Disabled is not an explanation.** A disabled button with no adjacent reason
  reads as broken. Say why, or leave it enabled and fail with a message.

## Gaps worth knowing

- **No loading state.** There is no `loading` prop and no spinner slot. Async
  actions currently disable the button and change nothing else, so a slow run
  looks identical to an ignored click. Handle it at the call site until the
  component grows one.
- **Shadows are Tailwind utilities**, not tokens — see `tokens/spacing.css`.
