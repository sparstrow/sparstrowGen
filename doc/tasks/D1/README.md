# D1 — design token conformance

| | |
|---|---|
| **Plan** | [2026-08-19-slop-skills.md](../../plans/2026-08-19-slop-skills.md) (follow-on phase) |
| **Kind** | **foundational** — no new surface; it makes an existing rule true |
| **Spec** | n/a (internal) |
| **Depends on** | — (the status tokens it needs already ship) |
| **Blocks** | **D2 — parametric theming** ([plan](../../plans/2026-08-19-parametric-theming.md)). Not a soft dependency: 228 hardcoded palette classes do not read tokens, so a parametric rebuild would leave every one of them showing the old neutral palette on a themed surface |
| **Status** | not started |
| **Open questions** | none |

## Why this phase exists

The first `slop-audit` run, 2026-08-19, found **228 Tailwind palette-class uses
across 23 files** in `packages/ui` and `apps/web`. `DESIGN.md` §12 Do says to
use semantic tokens and *never a raw hex or a Tailwind palette class*, so this
is not a matter of taste — the rule already exists and the code does not follow
it.

It went unnoticed because the checker that should have caught it was a
self-graded checklist that named nothing. That checker is gone (`DD-009`); this
phase clears what it never saw.

## What makes this a real problem, not tidying

`DESIGN.md` §2.5's **Named rule — Four Roles**: every colour on screen is brand,
status, provider identity, or actor identity, and **status is never
user-customisable** — green must mean *online* in every theme or status stops
being readable at a glance.

A hardcoded `bg-emerald-500` satisfies that rule by accident today and breaks it
the moment anything about the palette changes. More concretely: it is a colour
whose light and dark forms are maintained by hand at each call site, which is
why the codebase currently carries pairs like
`text-amber-700 dark:text-amber-300` — two values to keep in sync, per site,
forever. The token equivalent is one class.

## Shared facts every task in this phase relies on

**The tokens already exist and are already exposed as utilities.** No new CSS is
needed. `packages/ui/src/styles/globals.css` defines them per mode (lines 20–27
light, 54–61 dark) and maps them into Tailwind (lines 88–95):

| Token | Utility forms | Defined |
|---|---|---|
| `--success` / `--success-foreground` | `bg-success`, `text-success-foreground`, `border-success/30` | both modes |
| `--warning` / `--warning-foreground` | same shapes | both modes |
| `--info` / `--info-foreground` | same shapes | both modes |
| `--destructive` / `--destructive-foreground` | same shapes | both modes |

**There is already correct usage to copy.** `text-destructive`,
`border-destructive/30`, and `bg-destructive/5` appear in `chat-bits.tsx`,
`attention-queue.tsx`, `agent-form.tsx`, and others. The codebase is
inconsistent, not uniformly wrong — match the existing right answer rather than
inventing a convention.

**Opacity modifiers work on tokens exactly as on palette classes**, so
`bg-amber-500/5` → `bg-warning/5` keeps the same visual weight. This matters:
most of the drift is tinted backgrounds and borders, not solid fills.

## Out of scope for this phase, deliberately

**The 97 arbitrary type sizes** (`text-[10px]`, `text-[11px]`). `DESIGN.md` §3's
scale is explicitly *"a new decision, not mirrored from the app"* and has **no
CSS counterpart yet** — there are no type-scale tokens in `globals.css` to move
these onto. Sweeping them now would mean inventing the tokens mid-sweep, which
is how a design system acquires values nobody chose (`G-18`).

Unparks when the type scale lands as real tokens. Until then the literals stay
and are honest about it.

**Parametric theming** (`G-19`). This phase does not build the brand/surface
system; it removes the hardcoded colours that would otherwise have to be
rewritten twice.

## Definition of done

- No Tailwind palette class remains in `packages/ui/src` or `apps/web/src`,
  except any documented in the task as a deliberate exception with its reason.
- Every replacement verified in **both modes** and at more than one surface
  treatment — per `DESIGN.md` §12, the plainest surface is the honest case.
- `pnpm typecheck` and `pnpm build` clean.
- A re-run of `slop-audit` over the same targets reports the drift class cleared.
