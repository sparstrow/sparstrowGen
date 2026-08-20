# Card — usage notes

**Source:** `packages/ui/src/components/ui/card.tsx`. Mirror mode.

Parts: `Card` > `CardHeader` > `CardTitle` / `CardDescription` > `CardContent`
> `CardFooter`.

## Rules

- **Never nest a Card in a Card.** `nested-cards` is a certain-tier rule in the
  `ai-design-slop` catalogue: it is depth standing in for hierarchy. Use
  spacing, weight, and dividers instead. The card shows both versions side by
  side.
- **A card is a grouping, not a decoration.** If the content inside has no
  relationship, the border is drawing a box around a coincidence.
- **Do not use a grid of identical cards as the page structure.** That is
  `card-grid-as-structure` — the container that fits any content, and therefore
  says nothing about this content.
- **Cards do not stack elevation.** There are no shadow tokens, and the app
  separates surfaces with `--border` plus a lightness step. In light mode there
  is no lightness step at all, so the border is load-bearing.

## Where it belongs

Entity summaries, settings groups, and dialogs. Lists of rows are better as a
table or a divided list than as a column of cards.
