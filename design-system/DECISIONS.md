# Design decisions

**Why** the design is the way it is. `CHANGELOG.md` covers *what* changed; this
covers the reasoning, and it is the file to read **before changing a design
choice** — something that looks like an inconsistency is often the one place a
real decision was applied.

Newest first. Entries are never deleted, including rejected ones: a rejected
idea is the cheapest possible answer to "why don't we just…". Format and
guidance: `.claude/skills/design-system/references/decision-log.md`.

---

## DD-015 — What belongs in `packages/ui`: a design-system file knows nothing about Sparstrowgen's domain

**Date:** 2026-08-24 — **Asked by:** `T-VR-07` — **Surface:** package boundary, not a screen

**Situation:** `T-VR-03` moved every component that imported the deleted Vite
router out of `packages/ui`, on the belief that what remained would be the
design system `D-24` describes. It was not — `packages/ui/src` still held
~30 files with real Sparstrowgen domain knowledge (agent forms, run status,
the board, the Knowledge Center's content) plus the entire React Query data
layer, because none of them happened to import a router. The router test
never was a design-system test; it was a coincidence that worked for exactly
one prior migration.

**Decision:** A file belongs in `packages/ui` only if **it would make sense
unchanged in a different product** — it takes generic props (a string, a
size, a variant, a name), never imports `@sparstrow/shared`'s domain types,
and never encodes what a run, an agent, or a project *is*. `Badge` passes.
`RunStatusBadge`, which maps `run.status` to a colour, does not — it encodes
domain knowledge, however small the component. By this test:

- **Stays:** `components/ui/*` (shadcn primitives), `page-container.tsx`,
  `form-field.tsx`, `lib/utils.ts` (`cn()`), `lib/format.ts` (generic
  date/duration/currency/id formatting — no domain types imported despite
  formatting domain *values*), `styles/globals.css`, `theme/*`.
- **Borderline, ruled in:** `actor-avatar.tsx`. It takes a bare `name: string`
  and implements `DESIGN.md` §2.5's identity-hue derivation — the design
  doctrine's own algorithm, not app logic that happens to use design tokens.
  Its `kind: "agent" | "user"` parameter only selects a fallback icon and is
  the one place this file leans toward the app; not enough to move it.
- **Moves to `apps/web`:** every domain form (`agent-form`, `profile-form`,
  `workspace-form`), every domain-status component (`run-status-badge`,
  `run-transcript`, `blocked-project-actions`, `new-agent-button`,
  `skill-viewer`, `setup-card`, `update-banner`, `directory-picker-dialog`,
  `image-upload-field`), the whole `board/`, `canvas/`, `goals/`,
  `pipelines/`, `team/` feature directories, `api/hooks.ts` (data access is
  not design), and every domain `lib/*` file (`account`, `chat-turn-state`,
  `directory-picker`, `image-upload`, `live-events`, `merge-run-events`,
  `nav-meta`, `pins`, `setup`, `workspace-tabs`, `ws`).
- **A third category, neither design nor app code:** `content/knowledge/*.md`
  is product content, and moves into `apps/web` alongside the
  `knowledge.server.ts` that already reads it — not into `packages/ui`,
  which was never the right shelf for prose.

**Found while applying the test, not by design review:** `account.tsx`,
`image-upload.tsx` and `directory-picker.ts` each carry a "this capability
exists on the hosted web app, not on the local desktop build" branch, built
when two UI hosts genuinely disagreed about what existed. `D-24` retired the
second host. The branch is not yet removed here — that is behavioural
surgery, not a package move — but the premise it was written for is gone,
and whoever next touches these three files should know that before extending
the branch rather than deleting it.

Also found: `lib/knowledge.ts` used `import.meta.glob` — Vite-only syntax
that Turbopack silently no-ops rather than erroring on, so its `getArticle()`
had returned `undefined` on every call since `T-VR-01` deleted the Vite host
that made it work. See
[`BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`](../doc/bug/BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank.md).

**Generalises to:** any future file arriving in `packages/ui` gets this test
before it lands, not a router check — there is no router left to check
against.

**Status:** **locked**

---

## DD-014 - Settings: Appearance & Theme Architecture

**Date:** 2026-08-22 - **Asked by:** settings redesign - **Surface:** Settings Appearance

**Situation:** The Settings redesign required final product logic for how the theme picker operates under the hood before moving to implementation.

**Decision:**
1. **Sync:** Synced to Account (Cloud DB). The theme is a portable user preference that travels across devices.
2. **Application:** Instant (Reactive). Clicking a theme applies it to the DOM immediately for preview, without requiring a Save click.
3. **FOUC Prevention:** Cookie Cache (Server-Side Rendering). Because DB fetches on every page load add latency, the Next.js server reads a local cookie to inject the CSS classes on the first byte. The cookie acts as a fast-cache for the Cloud DB.
4. **Density:** Rejected. We stick to one highly-tuned monitoring density (13px body, tight padding) rather than shipping a Compact/Regular toggle.

**Generalises to:** Any future user-level preferences will follow the Cloud DB + Local Cookie Cache pattern to guarantee zero-flash fast loads.

**Status:** **locked**

## DD-013 — Actor identity is a neutral chip with a coloured mark, not a coloured chip

**Date:** 2026-08-19 · **Asked by:** found while solving §2.5's missing values · **Surface:** every avatar, board column, and actor label

**Ask:** n/a — §2.5 specified a form and named no values. Deriving the values
showed the form does not clear the contrast floor.

**Why:** §2.5 said actor identity is "used as a tint plus its own foreground".
Measured, that form reaches **3.91** in dark mode — an identity-coloured mark on
a 15% tint of its own hue. The tint lifts the ground by more than the mark
gains, so the gap closes rather than opening. It is not a bad hue: the same
measurement over the darkest surface flatters it by nearly a point, which is the
mistake that made this look fine the first time.

Three forms, measured:

| Form | Worst | What carries identity |
|---|---|---|
| Identity tint + identity mark | 3.91 ✗ | both, illegibly |
| Identity tint + neutral mark | 6.78 ✓ | the fill alone |
| **Neutral fill + identity mark + identity ring** | **7.16 dark / 4.72 light ✓** | **both** |

The second passes and is the obvious-looking fix, but it spends the whole
identity signal on a 15% tint of one hue — at 22px, one of those is very hard to
tell from another, which is the single thing this palette exists to do. So the
chip takes its fill from the surface's own raised step and spends the colour on
the mark plus a ring at 40%.

**The hues.** Six, from the 155 of 360 that sit ≥20° from every status hue, chosen
for the largest possible minimum separation from *each other*: **50, 135, 185,
235, 285, 335 — 50° apart.** A brand-distance constraint was measured and
rejected: adding ±20° around the five brand presets collapses the legal space to
four narrow bands and forces the six identities to within 15° of each other. That
trades the property identity exists for against a collision that only appears for
one accent choice at a time.

**Generalises to:** Yes — **when a doctrine specifies a form and a floor, derive
the values before trusting either.** The form here was written first and read as
obviously fine; the floor was written first and read as obviously satisfiable.
Only measurement showed they were mutually exclusive. Also: contrast against a
tint of a colour's own hue is worst over the *lightest* ground in the mode, not
the darkest — the intuition runs the wrong way.

**Status:** `DESIGN.md` §2.5 carries the six values and the form, verified by
`design-brief/contrast-check.mjs` — 2026-08-19

---

## DD-012 — A status token holds the colour, not a pale tint of it

**Date:** 2026-08-19 · **Asked by:** found while adding the approval status · **Surface:** every badge, dot, and tinted callout

**Ask:** n/a — a model inconsistency that would have made the `T-D1-01` sweep
produce invisible tints.

**Why:** The codebase carried two conventions at once. `--destructive` holds the
**saturated colour** (`oklch(0.577 0.245 27)`), used as `text-destructive`,
`bg-destructive/10`, `border-destructive/40` — 87 sites of the first alone.
`--success`, `--warning`, and `--info` hold a **pale tint**
(`oklch(0.94 0.06 80)`) with `-foreground` carrying the actual colour, used as
`bg-warning` plus `text-warning-foreground`.

`T-D1-01`'s mapping table sends `bg-amber-500/5` to `bg-warning/5` and
`border-amber-500/30` to `border-warning/30`. Under the tint convention those
are 5% and 30% of a near-white — **invisible in light mode.** The sweep would
have typechecked, rendered nothing, and looked like a token problem rather than a
model problem.

So all five status tokens now follow `--destructive`: the token is the colour,
`-foreground` is the neutral that goes on top of a solid fill. This also matches
`DESIGN.md` §2.4, whose table always gave one value per mode, and shadcn's own
convention. Six call sites change; `Badge`'s three variants keep working
unchanged because `bg-X` + `text-X-foreground` means the same thing in both
models.

**Also in this decision:** the neutral on a solid fill **flips with the mode** —
`oklch(0.16 0 0)` in dark, `oklch(0.985 0 0)` in light. The dark-mode status
values are light (L 0.70–0.80) and the light-mode ones are dark (L 0.42–0.55), so
a single foreground fails one mode outright. `--destructive-foreground` is
`oklch(0.985 0 0)` in both today, which is why a dark solid destructive badge
reads at 2.03:1.

**And two of §2.4's published values were under the floor** — success light at
4.14, danger light at 3.85, both against `--accent`. Recalibrated to
`oklch(0.498 0.15 155)` and `oklch(0.548 0.226 27)`. Same defect as `DD-010`,
found by the same sweep.

**Generalises to:** Yes — **before a mechanical find-and-replace across 228
sites, check that the replacement means what the original meant.** The mapping
table was right about intent (amber *is* warning) and wrong about mechanism, and
nothing in a typecheck or a diff review would have caught it.

**Status:** `DESIGN.md` §2.4; the token rewrite lands with `T-D1-01` — 2026-08-19

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
