# Parametric theming — making `DESIGN.md` §2 true — 2026-08-19

| | |
|---|---|
| **Spec** | `DESIGN.md` §2 — written with the owner via the `design-brief` skill on 2026-08-18 and reviewed then. It is the spec for this work in everything but filename: it states the contract in the owner's terms and decides nothing technical |
| **Status** | Draft |
| **Trigger** | Owner, 2026-08-19: the design system shows a neutral app, not the Amber-on-Paper they chose. `G-19` is why |
| **Depends on** | `T-D1-01` (band 14) — the palette sweep. Non-negotiable, see Decisions |
| **Touches** | `packages/ui/src/styles/globals.css`, `packages/shared/src/theme/`, `packages/ui/src/components/actor-avatar.tsx`, `DESIGN.md` §2.3–§2.5, `design-system-v2/` |
| **Tasks** | not decomposed yet — becomes `doc/tasks/D2/` |
| **Open questions** | `OQ-4` (the `--hl-*` syntax palette). Blocks one sub-item of D2.2, nothing else |

## Summary

`DESIGN.md` §2 specifies a theming contract — a user-picked brand accent and
surface character, every token derived from five root variables — that exists
only in `design-brief/theme-board.html`. The shipped `globals.css` holds 72
literal `oklch()` values with no derivation. This plan rebuilds `globals.css`
parametrically from those five variables, lands a contrast checker that can
prove the result, and adds the two colour roles the owner approved on 2026-08-19
(`approval` status, actor identity).

It closes `G-19` and `G-21` together, in that order of dependency but the
reverse order of execution: the checker has to exist before the rebuild it
verifies.

## What the spec asks for that isn't obvious

**§2 is the only section of the doctrine that is falsifiable, and nobody had
run the falsification.** Writing this plan did, and it changed the plan.

`G-21` recorded that §2.3's published contrast figures could not be re-derived
from the document — a consistent offset on all five presets, cause unknown. That
is now **solved**, and the solution is not a correction to the figures. Two
unstated assumptions reproduce them exactly:

1. **Linear sRGB is clamped to `[0,1]` before relative luminance.** Several
   preset × surface pairs land marginally outside gamut; unclamped, they compute
   a luminance no display can show.
2. **The worst case was measured against `--background` and `--card` only.**
   The third surface in the ramp — `--accent`, the raised step — was not in the
   sweep.

Under both, all five published figures reproduce to the second decimal.
`design-brief/contrast-check.mjs` is the reproduction — zero-dependency, run it
with `node design-brief/contrast-check.mjs`:

| Preset | Published | Re-derived | Worst pair |
|---|---|---|---|
| Amber | 4.50 | **4.50** | light / Soft / `--background` |
| Violet | 4.58 | **4.58** | light / Soft / `--background` |
| Blue | 4.55 | **4.55** | light / Soft / `--background` |
| Teal | 4.56 | **4.56** | light / Soft / `--background` |
| Rose | 4.57 | **4.57** | light / Soft / `--background` |

**And assumption 2 is a real hole, not a bookkeeping detail.** Extending the
sweep to the raised surface turns 40 combinations into 120, and **20 of them
fail** — every preset, every surface, light mode, on `--accent`:

| | Paper | Slate | Soft | Mono |
|---|---|---|---|---|
| Amber | 4.37 | 4.38 | **4.12** | 4.37 |
| Violet | 4.45 | 4.46 | **4.19** | 4.45 |
| Blue | 4.42 | 4.43 | **4.16** | 4.42 |
| Teal | 4.44 | 4.44 | **4.17** | 4.44 |
| Rose | 4.44 | 4.44 | **4.18** | 4.44 |

Dark mode passes everywhere. The failure is entirely light mode on the raised
surface, and it is uniform enough to be structural rather than a bad hue.

This matters because `--accent` is not a rare surface. It is the hover fill on
every row, the active tab, the selected item — precisely where a brand-coloured
label sits. §2's Contrast Floor rule says a preset is not shippable until
measured. Measured properly, none of the five currently is.

The fix is small: each preset's light-mode lightness drops by 0.017–0.022.

| Preset | §2.3 today | Clears all 120 |
|---|---|---|
| Amber | 0.550 | **0.528** |
| Violet | 0.555 | **0.538** |
| Blue | 0.540 | **0.520** |
| Teal | 0.515 | **0.496** |
| Rose | 0.560 | **0.542** |

That is a doctrine edit to §2.3, so it needs the owner's yes — but it is a
correction of measured fact, not a change of direction, and the visible
difference is a barely-perceptible darkening of the accent in light mode.

## Work breakdown

### Foundational — blocks the story

| Work | Why no story owns it |
|---|---|
| Contrast checker: OKLCH → OKLab → linear sRGB → WCAG, gamut-clamped, swept over every preset × surface × mode × ramp step | Produces a number in a test run. The owner sees nothing |
| Preset and surface tables as typed constants in `@sparstrow/shared`, with the CSS preset block emitted from them and drift-checked | Moves where a value lives. The screen is identical either way |
| `T-D1-01` palette sweep (band 14, already queued) | Removes 228 hardcoded classes that would survive the rebuild untouched |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US-T1 — "the app wears the palette I chose"** | Rebuild `globals.css` from `--sh`/`--sc`/`--bh`/`--bc`/`--bll`; recalibrate the five light lightnesses; ship Amber-on-Paper dark as the default | The owner opens the app and it is warm rather than neutral, with an amber accent that is theirs rather than shadcn's |
| **US-T2 — "I can tell agents apart, and tell 'waiting for me' from 'broken'"** | `approval` status token at hue 310; six actor-identity hues obeying Identity Is Not Status; rewire `actor-avatar.tsx` | An avatar stops reading as a status it has nothing to do with; a run awaiting a human is distinguishable from a failed one across the room |

Both stories are demoable alone. US-T1 without US-T2 is a themed app with the
old avatars; US-T2 without US-T1 is not buildable, because the identity hues are
defined by their distance from status hues in a ramp US-T1 establishes.

## Decisions

### `G-21` is closed by this plan, not carried into it

The alternative was to treat the unreproducible figures as an accepted
limitation and build the checker against the theme board's behaviour rather than
the doctrine's numbers. That would have been backwards: the doctrine is the
artefact people read, and a checker calibrated to match an undocumented method
enshrines the method without ever writing it down. §2 gains one sentence stating
the measurement basis, and the figures stand unchanged.

The recalibration in §2.3 is a separate consequence and is listed as an owner
decision, not folded in silently.

### The five variables live in TypeScript; the CSS is emitted and drift-checked

The theme board proves the derivation works in pure CSS — `--bg: oklch(0.145
var(--sc) var(--sh))` and so on — so the runtime needs no JavaScript, and this
plan does not add any. But the checker needs the same preset numbers the CSS
uses, and two hand-maintained copies of a table is exactly the failure `G-19`
describes one level up.

So: `packages/shared/src/theme/presets.ts` is the source, a small script emits
the `.theme-*` and `.surface-*` blocks into `globals.css`, and a test asserts
the committed CSS matches what the constants would emit. This is the same
recorded-fingerprint pattern `ds.mjs check` already uses, chosen over a build
step because it keeps `globals.css` a real readable file rather than a generated
artefact nobody opens.

Rejected: a CSS-only approach with the presets written directly in `globals.css`
and the test parsing them back out. Parsing CSS to test CSS makes the test the
weakest link, and the parser becomes a thing to maintain.

### The checker is a unit test, not a CI-only script

`G-21` says the risk is that the check gets skipped. A script someone has to
remember will be. `pnpm test` already runs in CI and locally, and contrast math
is pure — no browser, no DOM, no fixtures. A failing preset fails the suite the
same way a failing function does.

It sweeps **all three ramp steps** — `--background`, `--card`, `--accent` — in
both modes. Narrowing it to two is what hid the 20 failures.

### `T-D1-01` lands first, and this plan does not start until it does

228 hardcoded Tailwind palette classes across 23 files do not read tokens. A
parametric rebuild would leave every one of them showing the old neutral
palette on a themed surface, and the resulting app would look broken in a way
that is very hard to attribute. The D1 README already names this as its reason
for existing; this is the plan on the other side of it.

### Actor identity gets tokens, not Tailwind classes

`actor-avatar.tsx` currently holds a six-entry array of literal Tailwind classes
including `emerald`, `amber`, and `rose` — success, warning, and danger. That is
the violation §2.5 names. Replacing the hues without moving them onto tokens
would fix today's collision and leave the next one unguarded, so the palette
becomes `--identity-1..6` with foregrounds, and the 20°-from-status constraint
becomes an assertion in the same test file as the contrast sweep.

### Ship the preset the owner picked, and only that one, as a class

The five presets ship as `.theme-amber` … `.theme-rose` and four
`.surface-paper` … `.surface-mono` classes on the root, with Amber and Paper as
the `:root` default. No picker, no persistence, no settings row — that is `D-18`
and it is parked deliberately. What this plan delivers is that switching a class
in devtools visibly re-themes the whole app, which is the thing the picker will
later do.

## Phases

### D2.1 — the checker and the measurement basis *(foundational)*

Preset/surface constants in `@sparstrow/shared`; the contrast sweep as a test
over all 120 combinations plus the identity-vs-status separation rule; one
sentence in `DESIGN.md` §2 stating the measurement basis. Done when the test
passes against the **recalibrated** lightnesses and fails if any is reverted.

Depends on the owner accepting the §2.3 recalibration. If they decline, the test
ships asserting the current figures against `--background`/`--card` only, and
the 20 raised-surface failures become a `KnownGaps.md` entry instead — the phase
still lands.

### D2.2 — parametric `globals.css` *(serves US-T1)*

Rewrite the `:root` and `.dark` blocks as derivations of the five variables; add
the preset and surface classes; the emit-and-diff test. Done when the app runs
Amber-on-Paper, `pnpm build` is clean, and changing one class on `<html>`
re-themes every surface.

The `--hl-*` syntax-highlighting tokens are out until `OQ-4` is answered; they
stay as they are and the phase completes around them.

### D2.3 — approval status and actor identity *(serves US-T2)*

`--approval` at hue 310 with both modes measured; `--identity-1..6` chosen
against the 20° rule; `actor-avatar.tsx` rewired; a `Badge` variant for
approval. Done when `slop-audit` finds no palette class in the avatar and the
separation assertion passes.

## Scope boundaries

| Not doing | Where it lives |
|---|---|
| The theme picker UI, storage, per-device vs synced, flash-before-preference | `D-18` in `Deferred.md`, explicitly unparked by this plan closing |
| Type scale tokens | Out of `T-D1-01` for the same reason — §3 has no CSS counterpart. Not created here |
| Spacing and shadow tokens | §4/§5 specify them; inventing them mid-rebuild is `G-18` repeating |
| `--hl-*` syntax colours | `OQ-4` |
| Density as a third theming axis | `DESIGN.md` §13, undecided |

## Verification

| Criterion | How it gets checked |
|---|---|
| §2's five variables exist and everything derives from them | `grep -c 'oklch(' globals.css` drops from 72 to the handful of root definitions; every other token is a `var()` expression |
| Contrast floor holds | The sweep test: 120 combinations, zero below 4.5, failing loudly if a lightness is edited |
| The published figures are reproducible | The test's numbers and `DESIGN.md` §2.3's table are the same numbers, from the same constants |
| Identity Is Not Status | Assertion: no identity hue within 20° of a status hue, run in the same suite |
| Nothing regressed visually | `frontend-verify` over the main routes in both modes at Paper **and Mono** — Mono is the honest worst case, per `AGENTS.md` §3.11 |
| The design system stops lying | `ds.mjs sync --root design-system-v2`, then the surfaces card can show Paper and Mono side by side instead of saying it cannot |

**What cannot be verified here:** that a *user* can change the theme. There is
no control, by design. The check is that the mechanism responds to a class
change, which is a weaker claim, and `D-18` carries the rest.

## Result

<!-- Filled in as phases land. -->
