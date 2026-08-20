# Badge — usage notes

**Source:** `packages/ui/src/components/ui/badge.tsx`. Mirror mode.

```tsx
<Badge variant="warning">needs attention</Badge>
```

Variants: `default` `secondary` `destructive` `outline` `success` `info` `warning`.

## The rule that gets broken

**Use the status variant. Do not hand-roll one.** `success`, `info`, and
`warning` already exist and already carry both modes. A call site writing
`border-amber-500/40 text-amber-600 dark:text-amber-400` is re-implementing
`variant="warning"` badly, and then owns those values forever. The 2026-08-19
audit found this pattern across 23 files; the sweep is `doc/tasks/D1/`.

## Choosing

| Variant | Means |
|---|---|
| `success` | Online, passed, connected |
| `warning` | Needs a human — blocked or degraded |
| `info` | Queued, informational, no action implied |
| `destructive` | Failed, revoked, errored |
| `secondary` / `outline` | A label, not a state |

## Rules

- **Badges carry status, never brand.** Brand is identity; status is meaning.
- **A badge is not a button.** No click handlers. If it acts, it is a Button.
- **Colour is never the only signal.** Pair with the word, as every example on
  the card does. A colour-blind user reading a grid of dots learns nothing.
- **Approval has no variant yet.** `DESIGN.md` §2.4 specifies it (hue 310); it
  is not built. Until it is, do not approximate it with `warning` — that is the
  exact collapse the doctrine argues against.
