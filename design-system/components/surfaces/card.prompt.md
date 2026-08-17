# Card

Source of truth: `packages/ui/src/components/ui/card.tsx`

The standard surface: one lightness step above the page background, a 1px
border, and no drop shadow. Composed from `Card`, `CardHeader`, `CardTitle`,
`CardDescription`, `CardContent`, `CardFooter`.

## Usage

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@sparstrow/ui";

<Card>
  <CardHeader>
    <CardTitle>Machines</CardTitle>
    <CardDescription>3 active, 1 unreachable</CardDescription>
  </CardHeader>
  <CardContent>{/* … */}</CardContent>
</Card>
```

## Notes

- **Never add a drop shadow.** Flat-by-default is the system's defining rule
  (DESIGN.md §4). Depth is the surface step plus the border; a shadowed card is
  a defect, not a variation.
- `--card` and `--background` are the *same value* in light mode. A card on a
  light page is distinguished purely by its border, so removing the border makes
  it vanish. In dark they differ by one step.
- No coloured left-border stripes as accents — called out explicitly in
  DESIGN.md's Don't list.
- Padding is 20px (`--space-5`). Keep it; inconsistent card padding is the
  fastest way for a layout to look unconsidered.
- For a card that is entirely a table, drop `CardContent`'s padding so the table
  meets the border — a table inset inside padding reads as floating.
