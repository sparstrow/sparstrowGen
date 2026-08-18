# Design decisions

**Why** the design is the way it is. `CHANGELOG.md` covers *what* changed; this
covers the reasoning, and it is the file to read **before changing a design
choice** — something that looks like an inconsistency is often the one place a
real decision was applied.

Newest first. Entries are never deleted, including rejected ones: a rejected
idea is the cheapest possible answer to "why don't we just…". Format and
guidance: `.claude/skills/design-system/references/decision-log.md`.

---

## DD-006 — Theme system: user-selectable brand and surface

**Date:** 2026-08-18 · **Asked by:** owner · **Surface:** whole app

**Ask:** One primary brand colour that adapts across light/dark, selectable by
the user, plus a selectable surface character (paper / slate / soft / mono),
exposed in Settings.

**Why:** Owner wanted identity without betting the product on one hue, and
developers expect to theme their tools. This reframes the doctrine's job from
declaring a brand colour to defining a contract every theme must satisfy.

**Generalises to:** Yes — it is the structure of DESIGN.md §2. Four constraints
make it work rather than fail: curated presets only (never a free hex picker, an
unvetted colour will fail contrast and read as our bug); one accent *role*;
status colour explicitly not themeable; every preset contrast-verified in both
modes.

**Status:** in `DESIGN.md` §2 — 2026-08-18. The Settings → Display picker is a
real feature and is **not yet specified**; it needs `product-requirements`
before it is built.

---

## DD-005 — Amber on Paper, dark-first

**Date:** 2026-08-18 · **Asked by:** owner · **Surface:** whole app

**Ask:** Amber as the default brand accent; Paper as the default surface;
dark-first.

**Why:** Amber is genuinely unoccupied in this category — Linear is violet,
Supabase and Multica are green, Vercel is monochrome — and it sits naturally
beside Claude's own brand colour in provider marks. Paper gives the neutral ramp
a warm cast so the app stops looking like stock shadcn.

**Known characteristic, accepted:** Paper's hue (85) sits only 15° from amber's
(70), so the accent reads as *within* the surface's warmth rather than against
it. Separation comes from chroma (0.15 vs 0.010), not hue. Cohesive by design;
if it ever reads as too integrated the fix is a one-token hue nudge.

**Generalises to:** Defaults only. Every other preset remains available and
verified.

**Status:** in `DESIGN.md` §2.3 — 2026-08-18

---

## DD-004 — A single light-mode brand lightness does not work

**Date:** 2026-08-18 · **Asked by:** found while building the theme board

**Ask:** n/a — a defect in the first theming implementation.

**Why:** The first pass dropped every brand hue to `L=0.56` in light mode. Ten
of twenty light combinations then failed 4.5:1, worst at 3.82. Relative
luminance is dominated by the green channel, so equal OKLCH lightness does not
mean equal contrast: teal must go to 0.515 while rose sits at 0.560.

**Generalises to:** Yes — any future brand preset needs its own calibrated
light-mode lightness, measured rather than assumed. This is why the Contrast
Floor is a named rule with numbers attached rather than an aspiration.

**Also worth keeping:** the first measurement that "found" 20 failures was
itself wrong — this browser returns `getComputedStyle().color` as the original
`oklch()` string, so an RGB regex parsed OKLCH components as 0–255 values. Real
OKLCH → OKLab → linear sRGB conversion was needed. A contrast check that has not
been sanity-checked against a known-good pair should not be trusted.

**Status:** calibrated values in `DESIGN.md` §2.3; all 40 combinations verified
passing, worst case 4.50 — 2026-08-18

---

## DD-003 — Machines needs a per-machine profile showing its agents

**Date:** 2026-08-17 · **Asked by:** owner · **Surface:** Machines

**Ask:** Clicking a machine opens a profile for it, showing which AI agents that
machine holds — Claude, Antigravity, Ollama — each with an icon or logo.

**Why:** A machine's identity is largely *what it can run*. Today the capability
badges are bare text chips in a list row, which forces the reader to compare
strings across rows to answer "where can this job run?" — the question the page
exists to answer.

**Generalises to:** Probably a general list-row → detail-panel pattern rather
than a one-off. Worth deciding once, in the doctrine, which component carries
detail views across the app.

**Status:** **not scoped — new work.** This is not in
`doc/specs/2026-08-16-setup-and-machines.md`; that spec's "profile" means the
*user's* profile (avatar, name, about), not a machine's. Per the repo's
spec-first lifecycle this needs `product-requirements` before it is prototyped.
Two blockers worth knowing now: neither `sheet` nor `drawer` is installed, so
there is no primitive for a detail panel yet; and no provider logo assets exist
anywhere in the repo.

---

## DD-002 — Status and machine identity must be visible, not just legible

**Date:** 2026-08-17 · **Asked by:** owner · **Surface:** Machines (prototype)

**Ask:** Online status should read as a green badge or dot rather than plain
text, and each machine should carry an icon — a computer — beside it.

**Why:** The owner's words were that it looked "so blunt and plain." There *was*
a green dot, but at 7px beside the plain word "online" it did no work at a
glance. A monitoring surface is scanned, not read; status that requires reading
has failed at its only job.

**Generalises to:** Yes, strongly — this is not about the Machines page. It is
the doctrine's missing **Iconography** and status-colour vocabulary. Fixing it
per-page would leave every other surface equally flat, and would re-open the
same conversation on each one.

**Status:** **resolved — `DESIGN.md` §6**, 2026-08-18. The entity-tile pattern
(32px rounded tile + semantic icon + overlapping status dot) and the "Icons
Identify or Indicate" rule answer this directly, and the Machines prototype
should now be rebuilt against the doctrine rather than patched.

---

## DD-001 — The inherited design doctrine was retired, not amended

**Date:** 2026-08-17 · **Asked by:** owner · **Surface:** whole app

**Ask:** Delete `DESIGN.md` and `DESIGN.json` outright and regenerate a
project-specific doctrine through an owner interview.

**Why:** Both files were generic output from a general-purpose design tool
(`impeccable`), not a direction anyone chose for this product. That mattered far
more than it looked, because agents obey a doctrine faithfully whether or not it
was agreed: every screen passed review, every rule was honoured, and the result
was an app the owner did not want. The concrete trace — `DESIGN.md` line 93
instructed agents to prefer typography "rather than decorative icons", and the
One Accent Rule capped colour at 10% of any screen. The Machines prototype's
flatness was those two rules being followed correctly.

**Generalises to:** The process rule now in AGENTS.md §13 — the doctrine is
written by `design-brief` through owner interview, and **never restated
anywhere else**. Deleting the file was not sufficient on its own: the same rules
were duplicated in `design-system-conformance/SKILL.md`, in an orphaned
`DESIGN.json` nothing referenced, and cited by name in two agent definitions. A
conformance checker that hardcodes what it checks against can never be
re-pointed at a new design.

**Supersedes:** `DESIGN.md` and `DESIGN.json`, both generated 2026-08-09.
Recoverable from git history if any of it proves worth keeping.

**Status:** **closed** — replacement doctrine written 2026-08-18 via `design-brief`.

**Consequence not yet resolved:** `design-system/` was built partly against the
retired doctrine — `tokens/typography.css` and `tokens/spacing.css` carry values
sourced from its prose, `guidelines/` cards cite its rules by name, and
`--transition-base: 140ms ease` was invented during the mirror pass and exists
in no real stylesheet. See `CHANGELOG.md`. All of it needs rebuilding once the
new doctrine lands.
