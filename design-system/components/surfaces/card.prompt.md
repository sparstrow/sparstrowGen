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

- **Cards carry no drop shadow today.** This was the retired doctrine's
  defining rule (see `DECISIONS.md` DD-001) — depth is the surface step plus
  the border. It describes what the app currently does; it is no longer a rule
  anyone stands behind, and the new doctrine may change it.
- `--card` and `--background` are the *same value* in light mode. A card on a
  light page is distinguished purely by its border, so removing the border makes
  it vanish. In dark they differ by one step.
- No coloured left-border stripes as accents — a Don't inherited from the
  retired doctrine, pending re-decision.
- Padding is 20px (`--space-5`). Keep it; inconsistent card padding is the
  fastest way for a layout to look unconsidered.
- For a card that is entirely a table, drop `CardContent`'s padding so the table
  meets the border — a table inset inside padding reads as floating.
