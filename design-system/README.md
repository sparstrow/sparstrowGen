# Sparstrowgen — design system

An autonomous agent platform and developer control plane. The surfaces here are
**monitoring surfaces**: dense, scanned rather than read, and open for long
sittings. That is why the type scale runs denser than shadcn's defaults and why
motion stays under 200ms.

> **This was built 2026-08-19 as `design-system-v2`, to be compared against an
> earlier `design-system/` before either was kept.** That comparison is over —
> the earlier system was deleted 2026-08-31 and this one was promoted to
> `design-system/`, the sole copy from here on. What made it win the
> comparison is listed at the bottom of this file, kept as history.

## How to consume this

1. Link `styles.css` in your `<head>` — it is `@import` only, real values live
   in `tokens/`.
2. Load **Inter Variable** (`@fontsource-variable/inter`). It is the only font
   the system names.
3. **Dark is a `.dark` class on the root, not a media query and not a data
   attribute.** `:root` is light. The app ships dark, so `.dark` is the
   practical default even though the cascade treats it as the override.
4. Use `var(--foreground)`, `var(--warning)` and so on for every colour.
   **Never a hex literal and never a Tailwind palette class** — `bg-amber-500`
   is a defect, not a shortcut, and `DESIGN.md` §12 says so directly.

## Sources — mirror mode

This system documents real code. It does not reimplement it.

| Documented | Real file |
|---|---|
| All colour tokens, radius, font | `packages/ui/src/styles/globals.css` |
| Button, Badge, Input, Card, Empty, Skeleton | `packages/ui/src/components/ui/*.tsx` |
| Motion keyframes | `packages/ui/src/styles/globals.css` (lines 140–195) |

`node .claude/skills/design-system/scripts/ds.mjs check --root design-system`
diffs the recorded values against those files and exits non-zero on drift.

## The doctrine is not this file

`DESIGN.md` at the repo root is the design doctrine — written with the owner via
the `design-brief` skill. **This system documents what the code has; the
doctrine says what it should be.** Where they disagree, the doctrine wins and
the gap is a task, not a discrepancy to smooth over.

Every card that shows such a gap says so explicitly rather than rendering the
specified version and letting a reader assume it ships.

## What the app actually has, versus what §2–§7 specify

The most useful thing this system can tell you, stated once:

| Foundation | In the code | In `DESIGN.md` |
|---|---|---|
| **Colour** | Derived from `packages/shared/src/theme/tokens.ts`: 4 surfaces × 5 brands × 2 modes, as root classes | §2 — the theming contract. **Built** 2026-08-19; `G-19` closed |
| **Radius** | One base, three `calc()` steps. Real | §5 |
| **Status** | 5 tokens: success, warning, **approval**, danger, info — plus 6 **identity** roles | §2.4, §2.5. Both built and measured 2026-08-19 |
| **Code syntax** | 6 tokens per mode. Real, and never themed | §2.6 &mdash; the one foundation with **no gap**. Written to describe what shipped |
| **Type** | `--font-sans`, and nothing else | §3 — a seven-role scale. **No CSS counterpart** |
| **Spacing** | No tokens. Tailwind defaults at each call site | §4 specifies a base unit and density |
| **Shadow** | No tokens. Tailwind utilities | §5 |
| **Motion** | 4 real keyframes, durations written literally | §7. No tokens, and no `prefers-reduced-motion` anywhere |

## Known limitations & boundaries

- **There is no theme picker.** Surface and brand are class-swappable on
  `<html>` and nothing in the product changes them — no control, no storage, no
  per-device or per-account decision. That is `doc/Deferred.md` D-18, parked by
  the owner, and it needs a `product-requirements` pass before it is built. The
  light/dark toggle in Settings is a separate, older thing and is unaffected.
- **Nothing responds to `prefers-reduced-motion`** — verified 2026-08-19, no
  match in `packages/ui/src` or `apps/web/src`. `spg-pulse` is infinite.
- **`check` cannot catch an invented token.** It diffs recorded tokens against
  source; a token declared here that exists in no source passes clean. That is
  `doc/KnownGaps.md` G-18, and it is why this system defines fewer tokens rather
  than more.
- **`designs/Machines/` carries the Machines prototype** (list + per-machine
  profile, rebuilt 2026-08-31 against this system's real tokens — see its own
  `machines.handoff.md`), moved over from the deleted original system along
  with `DECISIONS.md` and `lib/` when this became the sole `design-system/`.
- **Contrast is verified, but not by this system.**
  `packages/shared/src/theme/theme.test.ts` sweeps every preset × surface ×
  mode × ramp step in `pnpm test`; these cards only display the result. A card
  that looks wrong here is a card bug, not a token bug.
- **Two exceptions to "no literal colours" ship on purpose.** The terminal
  canvas (`terminals.tsx`) is `#0a0a0a` in both modes because xterm takes a
  colour string rather than a variable, and the Google mark in
  `provider-icons.tsx` is that provider's own brand — §2.1's Provider role.

## What this replaced (kept as history — the original `design-system/` no longer exists)

| | Original `design-system/` (deleted 2026-08-31) | This system |
|---|---|---|
| Built against | The retired doctrine, partly | `DESIGN.md` as of 2026-08-19, including §2.4–2.6 |
| Invented tokens | `--transition-base`, `--space-*`, `--font-mono`, `--radius-full` — none exist in the app | **None.** Gaps are stated, not filled |
| Colour source | Whatever `globals.css` happened to hold | A typed table, with a test that fails on divergence |
| Cards depend on | At least one invented token, all 10 of them | Only tokens the app really has |
| Type scale | §3's prose transcribed into CSS | Shown as literals, labelled as unbuilt |
| Motion | One invented duration token | The four real keyframes, animating live |
| Components | 4 | 6 — adds Empty and Skeleton, the two states most often skipped |
| Prototypes | Machines (`designs/`) | Machines, rebuilt against this system's real tokens |

The original was not wrong so much as **honest in its comments and misleading
in its files**: it annotated the invented values clearly, and still shipped
them as CSS that renders. This one left the gap visible instead — which is why
it's the one that survived. When the Machines prototype moved over, its own
CSS had the same class of bug (using `--space-4`/`--font-mono`/
`--transition-base`, and inverting the `--success`/`--warning` token model to
match the original's stale pre-`DD-012` copy) — fixed in place rather than
carried forward. See `CHANGELOG.md`'s 2026-08-31 entry.
