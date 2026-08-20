# Button

Source of truth: `packages/ui/src/components/ui/button.tsx`

Six variants, four sizes. Built on Radix `Slot`, so `asChild` lets it render as
a link or any other element while keeping button styling.

## Usage

```tsx
import { Button } from "@sparstrow/ui";

<Button>Save changes</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="destructive">Delete machine</Button>
<Button size="icon" aria-label="Add"><Plus /></Button>

// Render as a link without losing button styling
<Button asChild><Link to="/machines">Machines</Link></Button>
```

## Variant → meaning

| Variant | Use for | Per screen |
|---|---|---|
| `default` | The one primary action | At most one |
| `secondary` | A supporting action of similar weight | A few |
| `outline` | Toolbar actions, filters, secondary controls | Many |
| `ghost` | Icon buttons, row actions, nav items — anything that should recede until hovered | Many |
| `destructive` | Irreversible or data-losing actions only | Rare |
| `link` | Inline navigation inside prose | Rare |

**Dark mode inverts `default`.** `--primary` is near-white on near-black in
dark, so a primary button is the *lightest* element on screen, not a coloured
one. This surprises people expecting a brand-coloured CTA — it is correct, and
it is why the retired doctrine's accent budget left colour free for status.
That rationale died with the doctrine (`DECISIONS.md` DD-001) — the neutral
primary is still what the code does, but it is no longer a defended choice.

## Sizes

| Size | Height | Use |
|---|---|---|
| `sm` | 32px | Toolbars, table row actions, dense panels |
| `default` | 36px | Standard forms and page actions |
| `lg` | 40px | Empty-state primary action, auth screens |
| `icon` | 36×36 | Icon-only — **always pair with `aria-label`** |

## Notes

- **`destructive` is about consequence, not tone.** "Delete machine" is
  destructive; "Cancel" is `outline`. Styling a merely-negative action as
  destructive makes the genuinely dangerous ones stop registering.
- **Icon-only buttons need `aria-label`.** The component cannot infer one, and
  a `size="icon"` button with no label is unusable on a screen reader.
- Focus is `focus-visible:ring-2 ring-ring` from the base class — do not
  override or remove it. Keyboard navigation through a dense control plane
  depends on it entirely.
- Disabled applies `opacity-50` plus `pointer-events-none`. Because pointer
  events are off, a tooltip explaining *why* it is disabled will not fire from
  the button — put it on a wrapping element.
- Icon spacing is handled by the base `gap-2`; do not add margins to the icon.
- `asChild` swaps the rendered element via Radix `Slot`, so it must receive
  exactly one child element. Two children throws at runtime.
