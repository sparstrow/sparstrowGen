# Sparstrowgen Design System — changelog

Newest first. Record token changes, new components, and new prototypes.

## 2026-08-19 — built for comparison against `design-system/`

Initialised in `mirror` mode against `packages/ui/src/styles/globals.css` and
`packages/ui/src/components/ui`. Both systems are in the repo deliberately, for
the owner to compare before one is removed.

**Tokens — 60 colour values (30 per mode) generated from the real stylesheet**,
not hand-transcribed, so a copy error is not possible. `--radius` plus its three
`calc()` steps kept as expressions rather than resolved, because the
relationship is the decision.

**No invented tokens.** This is the difference that motivated a second system.
The original defines `--transition-base`, `--space-*`, `--font-mono`, and
`--radius-full` in its own `tokens/`; none exists in the app, all ten of its
cards depend on at least one, and `check` passes clean because it only diffs
*recorded* tokens against source (`doc/KnownGaps.md` G-18). Here, a foundation
the app lacks is stated as missing rather than filled in.

**Guidelines — 5 cards:** surfaces, status &amp; identity colour, radius, motion,
type scale. Each names the gap between what ships and what `DESIGN.md`
specifies, rather than rendering the specification and letting a reader assume
it is real.

**Components — 6 cards, all registered with `--source`** for drift detection:
Button, Badge, Input, Card, Empty, Skeleton. Empty and Skeleton are new relative
to the original — the two of the four interface states most often skipped.

**Records the doctrine as of today**, including the two roles added answering
`OQ-3`: approval as a fifth status (§2.4) and actor identity as a fourth colour
role (§2.5). Both are shown as specified-not-built.

### Findings surfaced while building

- **Light mode has no surface ramp.** `background`, `card`, and `popover` are
  all `oklch(1 0 0)`; borders do all the separating. `DESIGN.md` §2.2 specifies
  a differentiated light ramp. Dark mode does have three real steps.
- **`Badge` already exposes `success` / `info` / `warning`**, so every
  hand-rolled `border-amber-500/40 text-amber-600 dark:text-amber-400` in the
  app bypassed a correct API. Documented on the badge card; the sweep is
  `doc/tasks/D1/`.
- **Nothing in the app responds to `prefers-reduced-motion`** — no match in
  `packages/ui/src` or `apps/web/src`. `spg-pulse` is infinite.
- **`Button` has no loading state.** Async actions disable it and change nothing
  else, so a slow run looks like an ignored click.

### Verified

`ds.mjs check` reports no drift. All 11 cards render in the browser with tokens
resolving, correct heights, and Inter Variable loaded; the type scale card
measures 28/17/15/13/12/11px, matching §3 exactly; all four shipping status
tokens resolve to their exact globals.css values; light and dark round-trip
through the viewer toggle.

**One console defect, in the generator rather than this system:** each card
iframe requests `../styles.css` once against the wrong base before `<base>`
applies, giving one 404 per card followed by the correct 200. The stylesheet
loads and cards render styled. `design-system/` shows the identical 11 × 404, so
it is not introduced here.
