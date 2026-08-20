# D2 — parametric theming

| | |
|---|---|
| **Plan** | [2026-08-19-parametric-theming.md](../../plans/2026-08-19-parametric-theming.md) |
| **Kind** | **foundational**, with one visible outcome — the app changes colour |
| **Spec** | `DESIGN.md` §2, owner-reviewed 2026-08-18 |
| **Depends on** | `T-D1-01` (band 14) — landed in the same push, see below |
| **Blocks** | `D-17`, the theme picker, which was parked *because* this did not exist |
| **Status** | ✅ done 2026-08-19 |
| **Open questions** | none |

## Why this phase exists

`DESIGN.md` §2 specified a theming contract — a user-picked surface character
and brand accent, every neutral derived from them — and carried a warning banner
saying so. `globals.css` held 72 literal `oklch()` values with nothing tying a
token's light and dark form together. That was `G-19`, raised the same day the
doctrine was written.

`G-21` was the companion: §2's published contrast figures could not be
re-derived from the document, so the rebuild had no way to verify its own
output.

Both are closed. The doctrine now describes the app.

## What actually shipped

| Task | |
|---|---|
| [T-D2-01](T-D2-01-contrast-checker.md) | The constants, and the floor as a test |
| [T-D2-02](T-D2-02-parametric-globals.md) | `globals.css` derived rather than transcribed |
| [T-D2-03](T-D2-03-approval-and-identity.md) | Approval status, six identity roles, the avatar rewired |

## On the ordering the plan specified

The plan put `T-D1-01` strictly before this phase, because 228 hardcoded palette
classes do not read tokens and would have kept the old neutral palette on a
themed surface. That reasoning is about the **observable result**, not about
correctness of either change, so both landed in the same push with the sweep
applied before the app was ever looked at. The stated failure — an app that
looks broken in a way nobody can attribute — never occurred.

Recorded here rather than silently, because a plan that says "strictly after"
and a history that shows "together" would otherwise read as a skipped step.

## Definition of done

- [x] Every colour in the app derives from `packages/shared/src/theme/tokens.ts`
- [x] `pnpm test` fails if any preset × surface × mode × ramp step drops below
      4.5:1, and if the committed CSS diverges from the emitter
- [x] Surface and brand are independently swappable and verified orthogonal
- [x] `pnpm typecheck` 7/7, `pnpm test` 5/5 packages, `pnpm build` 6/6
- [x] `design-system-v2` re-mirrored; no card claims a gap that closed
- [x] `G-19` and `G-21` deleted from `KnownGaps.md` with their proof named

## Known limitations & boundaries

- **No theme picker.** Classes on `<html>` are the whole interface. `D-17`.
- **The running app was never rendered.** `apps/web` needs Supabase credentials
  this environment does not have, so the tokens were verified through the
  design-system mirror, which loads the same generated CSS. See `G-22`.
- **Two literal colours ship on purpose** — the xterm canvas and the Google
  brand mark. Both annotated at their call sites.
