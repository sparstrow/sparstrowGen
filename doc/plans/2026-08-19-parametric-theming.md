# Parametric theming — making `DESIGN.md` §2 true — 2026-08-19

| | |
|---|---|
| **Spec** | `DESIGN.md` §2 — written with the owner via the `design-brief` skill on 2026-08-18 and reviewed then. It is the spec for this work in everything but filename: it states the contract in the owner's terms and decides nothing technical |
| **Status** | ✅ Completed 2026-08-19 |
| **Trigger** | Owner, 2026-08-19: the design system shows a neutral app, not the Amber-on-Paper they chose. `G-19` is why |
| **Depends on** | `T-D1-01` (band 14) — the palette sweep. Non-negotiable, see Decisions |
| **Touches** | `packages/ui/src/styles/globals.css`, `packages/shared/src/theme/`, `packages/ui/src/components/actor-avatar.tsx`, `DESIGN.md` §2.3–§2.5, `design-system-v2/` |
| **Tasks** | [`doc/tasks/D2/`](../tasks/D2/) — three tasks, all done |
| **Open questions** | none — `OQ-4` answered 2026-08-19 (option A, `DD-011`) |

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

**Accepted by the owner 2026-08-19**, after reviewing both specimens side by
side. §2.3 now carries the recalibrated lightnesses, a **Named rule — Measure
Against the Whole Ramp**, and the measurement basis in prose;
`design-brief/contrast-check.mjs` verifies all 120 combinations and every
published figure, exiting non-zero on either kind of failure.

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

### D2.1 — the checker *(foundational)*

Preset/surface constants in `@sparstrow/shared`; the contrast sweep as a test
over all 120 combinations plus the identity-vs-status separation rule. Done when
the test passes against the recalibrated lightnesses and fails if any is
reverted.

**No longer gated on anything.** The doctrine half landed on 2026-08-19 — §2.3
carries the recalibrated values and the measurement basis, and
`design-brief/contrast-check.mjs` is the working prototype this phase promotes
into `pnpm test`. Port it rather than rewriting it; it is already correct.

### D2.2 — parametric `globals.css` *(serves US-T1)*

Rewrite the `:root` and `.dark` blocks as derivations of the five variables; add
the preset and surface classes; the emit-and-diff test. Done when the app runs
Amber-on-Paper, `pnpm build` is clean, and changing one class on `<html>`
re-themes every surface.

**The twelve `--hl-*` values stay literal and are excluded from the rebuild** —
`OQ-4`, answered 2026-08-19 as option A and written up as `DESIGN.md` §2.6.
Syntax is the fifth colour role and is never themed, so a later agent finding
twelve untokenised chromatic values there should read §2.6 before "fixing"
them.

### D2.3 — approval status and actor identity *(serves US-T2)*

**The colour work is already done** — `G-21` closed on 2026-08-19 and
`DESIGN.md` §2.4/§2.5 now carry measured values: approval at
`oklch(0.78 0.15 310)` / `oklch(0.47 0.14 310)`, and six identity hues 50° apart
at 50/135/185/235/285/335. Derivation is
`design-brief/status-identity-solve.mjs`; the checker verifies them.

What remains is wiring: the five status tokens plus `--approval` and
`--identity-1..6` in `globals.css` under the `DD-012` model (the token is the
colour, `-foreground` is the neutral on a solid fill, and that neutral flips with
the mode), `actor-avatar.tsx` rewired to a neutral fill with an identity mark and
ring per `DD-013`, and a `Badge` `approval` variant. Done when `slop-audit`
finds no palette class in the avatar and the separation assertion passes.

## Scope boundaries

| Not doing | Where it lives |
|---|---|
| Theming the syntax palette | Answered: `DESIGN.md` §2.6 — syntax is never themed |
| The theme picker UI, storage, per-device vs synced, flash-before-preference | `D-18` in `Deferred.md`, explicitly unparked by this plan closing |
| Type scale tokens | Out of `T-D1-01` for the same reason — §3 has no CSS counterpart. Not created here |
| Spacing and shadow tokens | §4/§5 specify them; inventing them mid-rebuild is `G-18` repeating |
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

**All three phases landed on 2026-08-19.** `G-19` and `G-21` are closed and
deleted; `G-22` opened in their place. Both user stories are usable: the app
wears Amber on Paper, and agents have identity colours that cannot be mistaken
for status.

### What this plan did not anticipate

Five things, and the pattern in them is worth more than any one:

1. **§2.4's status colours had the same defect as §2.3's brand presets.** The
   plan treated `DD-010` as a one-off correction. It was a class: success light
   at 4.14 and danger light at 3.85, both against the raised step.
2. **The codebase had two status-token conventions at once**, and the sweep this
   plan sequenced first would have produced invisible tints under one of them.
   Caught by reading the values, not by any test that existed.
3. **§2.5's specified avatar form is unachievable at the contrast floor.** A
   doctrine can specify a form and a floor that are mutually exclusive, and
   nothing catches that until someone derives the values.
4. **Tailwind's CSS parser opens a string on an apostrophe inside a comment.**
   Only `pnpm build` sees it — not typecheck, not tests, not review.
5. **The plan's ordering claim needed a note, not obedience.** `T-D1-01` before
   `D2` was about the observable result; both landed in one push and the failure
   it guarded against never occurred. Recorded in `D2/README.md`.

The common thread: **every one was found by deriving a value rather than reading
a document.** `G-21` existed precisely to force that derivation, and it paid for
itself several times over. That is the argument for writing gap entries at all.

### What it spawned

- `G-22` — the running app has never rendered any of this.
- `D-17` unparked: the theme picker now needs a product decision, not mechanism.
- `DD-010` … `DD-013` in `design-system/DECISIONS.md`.
