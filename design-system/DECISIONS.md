# Design decisions

**Why** the design is the way it is. `CHANGELOG.md` covers *what* changed; this
covers the reasoning, and it is the file to read **before changing a design
choice** — something that looks like an inconsistency is often the one place a
real decision was applied.

Newest first. Entries are never deleted, including rejected ones: a rejected
idea is the cheapest possible answer to "why don't we just…". Format and
guidance: `.claude/skills/design-system/references/decision-log.md`.

---

## DD-011 — Code syntax is a fifth colour role, and is never themed

**Date:** 2026-08-19 · **Asked by:** owner, answering `OQ-4` · **Surface:** code blocks in chat and run transcripts

**Ask:** `globals.css` carries twelve `--hl-*` values that are none of the four
colour roles §2.5 allows. By the letter of the rule they are twelve bugs.
Decide what they are before the parametric rebuild reaches them.

**Answer: option A.** Syntax becomes a fifth role, fixed like status and
provider identity. The twelve values stay literal and are excluded from the
rebuild. `DESIGN.md` §2.1 grows a row and §2.6 says why.

**Why:** The Four Roles rule existed to stop arbitrary colour appearing with no
meaning attached. Syntax highlighting is the opposite of arbitrary — it is a
well-defined semantic mapping that simply is not one of the four. Naming it as a
fifth costs one table row and makes the doctrine describe the app instead of
quietly excusing it.

The two rejected options were both measured rather than argued, on a rendered
board the owner reviewed. **Tinting the palette with the surface** (option B)
costs about a third of the perceptual separation between the six colours —
smallest pairwise OKLab ΔE falls from 0.050 to roughly 0.033. **Mapping them
onto the existing roles** (option C) costs about half, to 0.026, and recolours
keywords when the user changes accent. Neither crosses into indistinguishable,
which is worth saying plainly because the first draft of the argument claimed it
did; the real objection is directional, not a threshold breach.

**Generalises to:** Yes, twice. First: a rule that would classify working,
deliberate code as a bug is a rule with a missing row, not a codebase with a
defect — check which before "fixing" twelve values. Second, and more useful: the
failure mode decided this. Nobody reports that code became harder to read, they
just read it less carefully, and on a monitoring surface a silent regression is
the worst kind.

**Also worth keeping:** option C is the trap. It looks like the most obedient
reading of the rule and does the most damage, because a green string literal is
not *online* and an amber number is not *needs attention* — it teaches the eye
that status colour is decorative, degrading every status signal in the app.

**Status:** `DESIGN.md` §2.1 and §2.6 — 2026-08-19

---

## DD-010 — A brand colour is measured against the whole ramp, not two thirds of it

**Date:** 2026-08-19 · **Asked by:** found while planning the `G-19` rebuild · **Surface:** every themed surface

**Ask:** n/a — a defect in the published contrast figures, surfaced by trying to
reproduce them.

**Why:** §2.3's first table was verified across "40 combinations" — 5 presets ×
4 surfaces × 2 modes, one background each. The ramp has **three** steps. Adding
`--accent`, the raised step, turns 40 into 120, and **all 20 light-mode
`--accent` combinations failed**, between 4.12 and 4.46.

That is not an obscure surface. `--accent` is the hover fill on every row, the
active tab, and the selected item — exactly where a brand-coloured label sits.
Every preset's light-mode lightness drops by 0.017–0.022 to clear it, which the
owner accepted after reviewing both versions side by side. The visible
difference is very small; the correctness difference is a rule that was being
enforced against two thirds of the cases it names.

**Generalises to:** Yes — **a floor is only as good as the sweep behind it, and
the sweep is the part nobody re-reads.** The rule said "every surface" and the
measurement said "every surface's first two steps", and the two sentences look
identical at a glance. Any named rule with numbers attached should say what was
measured, not only what passed. §2.3 now carries the measurement basis in prose
for the same reason.

**Also worth keeping:** this was found by trying to re-derive published figures
from the document alone, which is exactly what `G-21` was raised to force. The
gap entry did its job — the finding is the return on having written it down
instead of moving on.

**Status:** `DESIGN.md` §2.3, verified by `design-brief/contrast-check.mjs`
(120 combinations, exits non-zero on any failure or any figure that no longer
matches the table) — 2026-08-19

---

## DD-009 — Slop is catalogued separately from the doctrine, and audited by an agent that cannot fix

**Date:** 2026-08-19 · **Asked by:** owner · **Surface:** whole app, and every future one

**Ask:** Delete `design-system-conformance`, and build a named AI-slop catalogue
plus a generic auditing agent in its place — with coding and database slop
families to follow.

**Why:** The conformance skill forbade "drifting toward generic AI-slop
patterns" and named none, which is not a rule anyone can apply or fail. It was
also written before `design-system/` existed; once the token mirror and the
guideline cards were real, its remaining job was a prose hop between two
documents that already carried the answer. The `ui-ux-designer` agent went with
it for the same reason: a design spec in prose, sitting between `DESIGN.md` and
the code, is a third place for the design to be stated.

**The decision inside the decision** — and the one worth keeping: every
candidate rule sorts by *would this still be slop in someone else's app?*
Absolute tells (gradient text, a kicker above a heading, emoji standing in for
an icon) go in the catalogue and are portable. Everything project-specific is
drift, stays in `DESIGN.md` and `design-system/`, and the catalogue only points
at it. **`ai-design-slop` therefore contains no token name, no value, and no
palette of ours by construction**, which is the direct lesson of DD-001 below:
the last time design rules were copied into a skill, the copy went on enforcing
retired rules for every agent that loaded it, and re-pointing the doctrine could
not reach it.

**Rejected:** adopting `impeccable` or Anthropic's `frontend-design` skill
wholesale. Both are Apache-2.0 and both name real tells, but each carries its own
design doctrine — `frontend-design` generates an aesthetic per brief, which would
re-decide the look on every screen. We took the rules and the structure and left
the doctrine. Attribution: `.claude/skills/ai-design-slop/NOTICE.md`.

**Also rejected:** letting the audit fix what it finds. An author auditing their
own surface is not a second opinion. `frontend-builder` loads the catalogue so
the tells never go in; `slop-killer` checks afterwards and does not fix.

**Corrected same day:** report-only was designed to be *structural* — the agent
declares no `Write` and no `Edit`. The harness appends them anyway, so the tool
list is not self-enforcing and the claim was wrong as written. The boundary is
now a behavioural rule stated in three places, and the evidence is
`git status --short` unchanged across a run. Worth knowing before designing any
future agent around a restricted tool list.

**Generalises to:** AGENTS.md §3.13 — design lives in `DESIGN.md` +
`design-system/`, repo mechanics live in `frontend-wiring`, and slop is a
portable family with its own catalogue. A new family (`ai-coding-slop`,
`ai-database-slop`) drops in by supplying a catalogue with the same schema and
tiers; `slop-audit` and `slop-killer` need no change.

**Supersedes:** `.claude/skills/design-system-conformance/` and
`.claude/agents/design/ui-ux-designer.md`, both deleted 2026-08-19 and
recoverable from git history. `frontend-component-build` was renamed
`frontend-wiring` in the same change — its name implied it owned component
design when it actually holds paths, adapters, contracts, and verification.

**Status:** **closed** — plan at `doc/plans/2026-08-19-slop-skills.md`.

**Known limit:** the audit's static pass cannot reach render-tier rules on a
component with no route to paint it. Tracked in `doc/KnownGaps.md`.

---

## DD-007 — Amber stays at hue 70; the warmer variant was rejected

**Date:** 2026-08-18 · **Asked by:** owner · **Surface:** whole app

**Ask:** Having seen the separation options side by side
(`design-brief/hue-nudge.html`), should amber move to a warmer hue that reads as
a distinct colour against Paper rather than part of it?

**Why rejected:** The cohesive reading is the intended one. An accent that sits
*inside* the surface's warmth matches the north star — an interface that earns
attention rather than demanding it. The more separated amber (hue 50, 2.6 JND
away) reads more energetic, which is a different product than the one being
built. Legibility was never the question: both clear the contrast floor
comfortably (9.63:1 vs 9.32:1).

**Generalises to:** Nothing — this is a defaults decision only. It does confirm
the principle in `DESIGN.md` §2.3 that separation is a *brand hue* choice and
never a surface one.

**Status:** rejected — kept for the record. `DESIGN.md` §2.3 unchanged, amber
remains hue 70 / chroma 0.15.

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
it. Separation comes from chroma (0.15 vs 0.010), not hue. Cohesive by design.

**Correction — the remedy is not what was first stated.** This entry originally
said the fix, if it ever read as too integrated, was "a one-token hue nudge",
implying the surface. Measured against `design-brief/hue-nudge.html`: shifting
Paper's hue 85→100 is **0.13 JND** and halving its chroma is **0.25 JND** — both
invisible, because a surface at chroma 0.010 has no perceptible hue to move.
Only moving the **brand** hue works (amber 70→50 = **2.6 JND**). Surface sets
warmth of character; brand hue sets separation.

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

## DD-008 — Navigation model: tab strip + side sub-nav, rollout order

**Date:** 2026-08-18 · **Asked by:** owner · **Surface:** whole app

**Ask:** Entity list rows open into a "profile" with tabs or a side sub-menu.
Tangential actions inside a profile (start a new chat) should be able to open
in a new tab or a small centre window instead of navigating away. Wanted as a
written instruction in DESIGN.md so any agent designing frontend does this
"smartly" without being asked each time. Rollout requested across Machines,
Agents, and Projects.

**Why:** The owner's own words made clear this was two things at once — which
profile is open, and which section of it you're viewing — conflated under one
ask. Separating them let each get its own contract instead of one vague one.
The destination question (tab vs modal) needed a rule, not a per-click prompt,
or it becomes friction on every single action.

**Generalises to:** Yes, entirely — this is now `DESIGN.md` §9, a full section,
not a per-page pattern. Verified against a real interactive board
(`design-brief/entity-profile-board.html`) before being written down: state
preservation across tab switches was checked in the DOM, not assumed, and the
board's own throwaway `<div>`-based interactions surfaced the accessibility gap
that became §9.3's mandatory requirements.

**Sequencing, not full scope:** the owner asked for Machines + Agents +
Projects together. §9.4 stages them — Machines first (DD-003, a real gap,
nothing to regress), Agents next (same shape of gap), Projects last and only
after the first two are proven, because it's a migration of *working* code
(`project-detail.tsx`'s existing sidebar tabs) rather than a greenfield build,
and carries real regression risk the other two don't.

**Status:** in `DESIGN.md` §9 — 2026-08-18. Not yet built for real; §9.4's
rollout order is the build sequence when it is.

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

**Status:** **shape resolved, build not started.** `DESIGN.md` §9 now specifies
the profile pattern in full — side sub-nav for sections (Overview/Agents/
Activity/Settings), the outer tab strip for opening the profile itself, ships
first per §9.4. Still needs `product-requirements` before build, since it
remains outside `doc/specs/2026-08-16-setup-and-machines.md`'s scope (that
spec's "profile" is the user's, not a machine's). The `sheet`/`drawer` blocker
is now moot — the resolved pattern uses the tab strip + side sub-nav, not an
overlay panel. Provider logo assets remain unresolved (§13).

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
