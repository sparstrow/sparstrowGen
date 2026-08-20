# T-D2-01 — the theme constants, and the contrast floor as a test

| | |
|---|---|
| **Tag** | `[S]` — everything downstream reads these constants |
| **Serves** | **foundational** — produces a number in a test run; the owner sees nothing |
| **Depends on** | — |
| **Blocks** | `T-D2-02`, `T-D2-03` |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-19 |

## Objective

Move `DESIGN.md` §2 out of prose and into typed constants, and make the
Contrast Floor a gate that runs rather than a rule that is remembered.

## What was built

`packages/shared/src/theme/`:

| File | |
|---|---|
| `colour.ts` | OKLCH → OKLab → linear sRGB → WCAG, in the exact form §2.3 names |
| `tokens.ts` | Surfaces, brands, status, identity, syntax, and the derivation helpers |
| `css.ts` | Emits the generated region of `globals.css` |
| `theme.test.ts` | The gate |

Ported from `design-brief/contrast-check.mjs`, which stays as the prototype
beside the theme board it was written against.

## Decisions made while building

**Regeneration is a snapshot-update flag, not a CLI.** `UPDATE_THEME_CSS=1 pnpm
--filter @sparstrow/shared test`. A standalone `.mjs` was written first and then
deleted: it needed `tsx` as a new dependency purely to read two TypeScript
files, and vitest already has the loader.

**`--destructive` stays as an alias of `--danger`.** The doctrine says danger,
87 call sites and every shadcn primitive say destructive. One emitted line
reconciles them; renaming is churn with no reader benefit.

## Verification

- `pnpm test` — 250 tests in `@sparstrow/shared`, all passing.
- The floor sweep covers **120** combinations, asserted to be 120 so a future
  narrowing of the sweep fails loudly rather than passing quietly.
- Every figure in §2.3's table is asserted against its own derivation.

## Result

Two things the tests caught that review would not have:

- **My first linear-sRGB sanity assertion was wrong.** It expected `>0.15` for
  `oklch(0.5 0 0)`; the answer is exactly `0.125`. Replaced with the exact
  identity — for an achromatic colour the conversion collapses to `L³` — which
  is both correct and a sharper check against an accidental de-gamma step.
- **The CSS drift test failed on line endings.** Python writes CRLF on Windows,
  the emitter produces LF, and a colour-drift check became a line-ending check.
  Both sides are normalised now.
