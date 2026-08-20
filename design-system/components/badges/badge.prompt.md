# Badge

Source of truth: `packages/ui/src/components/ui/badge.tsx`

Status indicator used in tables, list rows, drawers, and next to page titles.
Seven variants; four carry semantic meaning, and choosing between them is a
product decision rather than a colour preference.

## Usage

```tsx
import { Badge } from "@sparstrow/ui";

<Badge variant="success">Completed</Badge>
<Badge variant="info">Running</Badge>
<Badge variant="warning">Queued</Badge>
<Badge variant="destructive">Failed</Badge>
<Badge variant="outline">Draft</Badge>
```

## Variant → meaning

Pick by what the state *means*, never by what colour looks right.
`variant="success"` and "make it green" produce identical pixels and completely
different maintainability.

| Variant | Means | Sparstrowgen examples |
|---|---|---|
| `success` | Terminal good state — finished, nothing left to do | Run completed, machine active, task done |
| `info` | In flight, progressing normally, no action needed | Run running, syncing, dispatched |
| `warning` | Needs attention but is not yet wrong | Queued too long, machine unreachable, nearing a limit |
| `destructive` | Actually wrong — failed or blocked | Run failed, auth expired, migration blocked |
| `secondary` | Neutral count or muted tag, no signal intended | Row counts, tag chips |
| `outline` | Lowest emphasis — a label, not a status | Draft, unset, category label |
| `default` | High-contrast emphasis, rare in this app | Plan tier, one featured label |

The `success`/`info`/`warning`/`destructive` set mirrors the run and task status
vocabularies in `packages/shared/src/schemas/run.ts` and `.../task.ts`. Map the
enum to the variant once in a shared helper rather than branching on status
strings at each call site — that is where drift starts.

## Notes

- **`default` is not the default choice.** It renders high-contrast
  primary-on-inverse and pulls the eye harder than any status colour; in a
  twenty-row table it reads as an alert. Use `secondary` or `outline` for
  anything neutral.
- **Never use a status variant decoratively.** A green badge that does not mean
  "succeeded" teaches people to ignore green.
- Colour alone is never the signal — every badge carries text. A dot may be
  added but never replaces the label. Accessibility requirement, not a style
  preference.
- It renders a `<span>` and is not interactive. If it needs a click, wrap it or
  use a different control.
- Counts belong beside a page title (`Machines 12`), not inside table cells
  where they compete with the row's own data.
