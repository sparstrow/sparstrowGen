# Sparstrowgen Design System — changelog

Newest first. Record token changes, new components, and new prototypes.

## 2026-08-31 &mdash; became the sole `design-system/`

The original `design-system/` (this system's own point of comparison, see
`README.md`) was deleted and this system — built 2026-08-19 as
`design-system-v2` — was renamed into its place. `DECISIONS.md`, `lib/`, and
`designs/Machines/` moved over from it in the same change; everything else
(`components/`, `guidelines/`, `tokens/`, `index.html`, `system.json`) was this
system's own and needed no change.

**The moved Machines prototype had two classes of bug from where it was
built**, both fixed on the way in rather than carried forward:
- Four tokens the original had invented (`--space-4`, `--space-5`,
  `--font-mono`, `--transition-base`) don't exist here on purpose — replaced
  with the literal values they resolved to, matching every guideline card's
  own convention.
- `--success`/`--warning` were used as `-foreground` for solid marks (dots,
  status text, the settings switch), matching the original's stale
  pre-`DD-012` mirror. Inverted back to the base tokens, which this system's
  `colors.css` already gets right.

Also did the Paper/Mono/light-mode verification pass `DESIGN.md`'s Do/Don't
requires, which the prototype's first build skipped because the original
system had no surface classes to switch to — this one does. See
`designs/Machines/machines.handoff.md`'s Verification section.

## 2026-08-19 (latest) &mdash; the doctrine became description

`G-19` closed. `DESIGN.md` §2 specified a theming contract the app did not
have; it now has it, and this system mirrors the result rather than naming the
gap.

**`tokens/colors.css` is a verbatim copy of the generated region of
`globals.css`**, which is itself emitted from
`packages/shared/src/theme/tokens.ts`. Three links, one source. 310 values, none
hand-maintained: 4 surfaces &times; 5 brands &times; 2 modes, plus the fixed
roles.

**Surface and brand are orthogonal and class-swappable.** Verified live in this
viewer: adding `surface-slate` to a card document moves `--background` from hue
85 to 250 and leaves `--brand` alone; adding `theme-teal` moves `--brand` from
hue 70 to 190 and leaves the neutrals alone. Removing both restores the default
exactly.

**Light mode gained its surface ramp.** It was `1.0 / 1.0 / 1.0` &mdash; the
finding this system opened with. It is now `0.985 / 1.0 / 0.955`, three real
steps, derived rather than transcribed.

**Approval and the six identity roles ship**, with measured values rather than
"hue 310, values owed". New `code-syntax` card documents the fifth colour role.
The `surfaces` and `status-colors` cards no longer describe gaps that closed.

### Corrections this forced

- Two of the four original status colours were **under the 4.5:1 floor** once
  the sweep covered the raised step: success light at 4.14, danger light at
  3.85 (`DD-012`).
- The status token model was **inverted** for three of the five: `--warning`
  held a pale tint rather than the colour, which would have made
  `bg-warning/5` invisible in light mode (`DD-012`).
- §2.5's specified avatar form &mdash; an identity tint plus the colour's own
  foreground &mdash; **cannot clear the floor in dark mode**, topping out at
  3.91. The chip is now a neutral fill with a coloured mark and ring
  (`DD-013`).

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

## 2026-08-19 (later) &mdash; code syntax documented as the fifth colour role

`OQ-4` was answered: syntax highlighting is a colour role of its own, fixed and
never themed (`DESIGN.md` §2.6, `DD-011`). Two consequences here.

**`tokens/colors.css` gained the twelve `--hl-*` values.** `system.json` had
been fingerprinting them since this system was built, so `check` would have
caught a change to them &mdash; but the token file a reader opens did not list
them, and the two disagreed. 31 + 30 becomes 37 + 36.

**New guideline card, `code-syntax`.** It is the only card in this system that
documents a foundation with **no gap between doctrine and code**, because §2.6
was written to describe what already ships rather than to specify something to
build. Every other card here names a gap.

Also folded in: `DESIGN.md` §2.3's five light-mode brand lightnesses dropped
0.017&ndash;0.022 (`DD-010`). Nothing in this system renders them &mdash;
`--brand` still does not exist in the app &mdash; so no card changed, but the
`status-colors` card's specified-not-built list is now measured against the
corrected table.

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
