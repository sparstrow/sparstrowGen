# Input

Source of truth: `packages/ui/src/components/ui/input.tsx`

A bare text field. It ships no label, no error text, and no layout — those are
composed around it, which is why the card shows a field *assembly* rather than
the input alone.

## Usage

```tsx
import { Input, Label } from "@sparstrow/ui";

<div className="flex flex-col gap-1.5">
  <Label htmlFor="agent-name">Agent name</Label>
  <Input id="agent-name" placeholder="spec-writer" />
</div>
```

## Notes

- **`htmlFor` / `id` must match.** A visually adjacent label that is not
  programmatically associated does not announce, and clicking it does not focus
  the field.
- **Error state is composed, not a prop.** There is no `error` variant. Add
  `aria-invalid` plus a border override and render the message yourself, and
  point at it with `aria-describedby` so it is announced rather than merely
  visible.
- Placeholder is not a label. It disappears on input, uses `--muted-foreground`
  which is deliberately low-contrast, and is the single most common
  accessibility regression in forms. Use it for format hints only
  (`BD-3684-KO`), never for the field name.
- Border uses `--input`, not `--border` — in dark they differ (15% vs 10% white)
  so fields read as interactive against static panel edges. Do not substitute one
  for the other.
- Height is 36px, matching `Button` at default size, so a field and its adjacent
  button align without correction.
- For numeric fields compared down a column, add `tabular-nums`; otherwise the
  digits shift as the value changes.
