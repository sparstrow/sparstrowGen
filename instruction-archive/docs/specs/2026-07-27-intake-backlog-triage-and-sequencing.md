# Intake backlog — triage and implementation sequencing

Date: 2026-07-27 · Status: **approved, amended 2026-07-27** · Supersedes: `docs/intake/` as the
live backlog

> **Amendment, 2026-07-27.** 6-pre split in two. Its **primitive layer shipped** (§3); its
> **redesign moved to after `6f`** (§2.2, §4). The sequencing table in §2 is current; prose written
> before the amendment is marked where it is superseded.

## Purpose

`docs/intake/` was retired when the build contract moved to superpowers. Seven captures were left
open in it. This spec triages all seven against current code and against
`docs/planned/phase6-hosted-foundation.md`, and sequences what survives.

**This document does not design anything.** Where an item needs a design, it says so and names the
decision. Per `CLAUDE.md`'s hard gate, those designs come from a `brainstorming` session with the
owner, not from an agent writing a spec unilaterally.

---

## 1. Triage

| Item | Verdict |
| --- | --- |
| **0005** dev/preview port conflict | **Already shipped.** Bookkeeping only. |
| **0006** gym app as live verification target | **Design approved already.** Ready to plan. |
| **0007** factory performance tracking | **Data layer absorbed by Phase 6e.** Only the consumer surfaces remain. |
| **0008** chat message duplication | **Live bug.** Needs root cause before a fix. |
| **0009** agy returns canned replies | **Live bug.** Needs root cause before a fix. |
| **0010** QA-user agent | **Needs brainstorming.** Wide design space. |
| **0011** agent-authored capture safety | **Invalidated by our own change.** Needs re-design. |

### 0005 — shipped, never marked

The fix is in the tree: `packages/ui/vite.config.ts:43` reads `SPARSTROW_PORT`,
`scripts/dev-preview.mjs` launches core and UI on 48751 with a throwaway data dir, and
`pnpm dev:preview:core|ui` are wired in the root `package.json`. Landed as `cc058c5`, on `main`.

The doc still said `status: locked`. This is exactly the intake-lifecycle bookkeeping the old
contract flagged as "silently skipped" — closed as part of this change.

### 0007 — the data layer is already specified

`phase6-hosted-foundation.md` §3.5 names 0007 explicitly: the `run_metrics`, `run_tool_calls`,
`run_errors` and `run_decisions` tables are called "the analysis substrate required by intake
`0007`". So 0007's hardest part — getting queryable per-run facts without exhausting the database —
is designed and sequenced into **6e**.

What 0007 still owns is the three consumer surfaces the owner asked for, which §3.5 does not cover:
a live dashboard, a periodic improvement report, and active flagging when refinement is needed.

**Consequence: 0007 cannot be built before 6e**, and building a metrics pipeline against SQLite
`run_events` now would be throwaway work.

### 0011 — invalidated, but the concern survives

0011 is written entirely in terms of the Curator and `docs/intake/`. Both were deleted on
2026-07-26. As written, it is unbuildable.

The underlying concern is untouched and still real: **an agent-authored proposal must never be
mistaken for an owner-approved requirement**, because a downstream coding agent will implement it.
The worked example still bites — a QA agent proposes "delete agents", the owner rejects it, and the
rejection has to be recorded in a way that a later agent cannot read as a requirement.

Re-expressed for the current flow, the open design questions are:

1. Where does provenance live now — frontmatter on a `docs/specs/` file, or somewhere else?
2. What blocks an agent-authored spec from reaching `writing-plans` without owner review?
3. The old rule "the verbatim block is sacred, never rewritten" existed to protect the *owner's*
   words. Does it apply to agent-authored text, which the owner explicitly wants pruned? These
   conflict, and the conflict is the actual design question.

**This needs a `brainstorming` session.** It is small but it is a safety gate, and getting it wrong
means rejected ideas get built.

### 0010 — depends on 0011

The QA-user agent's whole output channel was "files an intake doc". That channel no longer exists.
Its findings now have to land as specs, which puts it squarely behind 0011's provenance rule — an
agent filing specs is the exact hazard 0011 exists to contain.

Design space that is genuinely open: how deep "end-to-end per feature" goes, how it drives the app
(the Browser-pane preview vs. the packaged build), how it avoids re-filing the same finding every
run, and whether it is one agent or a skill invoked against a running instance.

### 0006 — approved, and more valuable early than late

`docs/planned/verification-agent-gym-app.md` is an approved design, reviewed twice (an internal
adversarial pass and an independent review). It does not need brainstorming; it needs a plan.

Its Phase 1 is a bootstrap: an outside agent creates a Team, test agents and a pipeline through the
real UI, reusing existing Team Workspace rather than new coordination infrastructure. The recurring
unattended build is later, and gated on a failure cap, a kill switch, and EH7 write-scope safety.

---

## 2. Sequencing

The governing constraint is Phase 6: **6a–6f are serial**, and each phase must leave the app
working. Everything below is placed relative to that.

**Owner decisions, 2026-07-27:** Phase 6 runs first and the gym app is tested *against* the finished
result, so 0006 moves after 6f in full — no bootstrap slice beforehand. And 6-pre is a **full
frontend redesign**, not a complaint-driven pass; see §2.1.

**Superseding owner decision, 2026-07-27 (later the same day):** 6-pre's *primitive layer* shipped,
but the **redesign moved to after 6f**. See §2.2 — the sequencing below reflects this.

| # | Work | Why here | Blocked by |
| --- | --- | --- | --- |
| 1 | **0009** agy canned replies | One of two providers is effectively non-functional. Backend-side, and every later item that exercises agents inherits the defect. | — |
| 2 | **0008** chat duplication | Visible defect on a daily-use surface. Root-cause first. | — |
| 3 | ~~**6-pre** full frontend redesign~~ **6-pre Phase A — primitive layer only** | **Done 2026-07-27.** 18 → 26 primitives. The four-states rule was *unsatisfiable*, not merely unmet; this makes it satisfiable. The redesign itself moved to #9. | — |
| 4 | **6a → 6f** | The active architecture. Serial, one axis per phase. Runs on today's UI. | — |
| 5 | **0007** dashboard, report, flagging | Its data layer ships in 6e. Also needs the `chart` primitive, still unvendored. | 6e |
| 6 | **0011-revised** provenance + review gate | Safety gate for any agent that authors specs. Small. | brainstorming |
| 7 | **0010** QA-user agent | Dogfoods the finished app rather than the half-migrated one. | 0011 |
| 8 | **0006** gym app verification target | Owner's decision: Phase 6 first, then test the gym app against the finished platform. | 6f |
| 9 | **Full frontend redesign** — 24 pages **and** navigation | Designed against real tenancy, as one pass rather than two. `docs/deferred/2026-07-27-full-frontend-redesign.md`. | 6f |

### 2.1 Why 0010 moved late

In the previous ordering 0010 came before 6-pre, on the reasoning that a QA agent's findings should
drive the frontend pass instead of guesswork. That reasoning does not survive the scope change: a
deliberate, design-led redesign against UI/UX principles does not need a bug list to start from, and
waiting on an agent to produce one would delay the work that unblocks every surface. 0010 is more
valuable pointed at the finished app.

**Amended 2026-07-27.** The redesign moved to #9, so 0010 at #7 now runs *before* it — which
partially revives the reasoning dismissed above. A QA agent pointed at the post-6f app produces a
findings list while the redesign is still unspecified, so those findings can inform it after all.
The dismissal still stands on its narrow point (the redesign does not *need* a bug list to begin,
and must not block on one), but the ordering now gives it one for free. Worth using rather than
ignoring when the redesign spec is written.

### 2.2 Why the redesign moved behind Phase 6

The original position — 6-pre before 6a — rested on "a redesign and a data migration should never
fail at the same time". That still holds, but it argues only for *serialising* them, not for which
comes first.

What settled the order is that deferring costs almost nothing and buys a better design. The obvious
argument for going first is avoiding rework, and the obvious counter is that rework could be
contained by keeping data access in the `@/api/hooks` layer so workspace scoping lands in one place.
That counter is true and beside the point: the hook layer protects the *plumbing*. Twenty-four
surfaces designed while a single workspace is the only workspace encode that assumption as **design**
— empty states reading "No agents yet" instead of "No agents in this workspace", headers with
nowhere to show which workspace is active, action buttons that a viewer role should never see. No
amount of hook discipline catches those, because they are not wiring.

The same reasoning merges the two depths. Navigation should express the feature set, and Phase 6
introduces workspaces, members, roles and run metrics — new navigational concepts. A surfaces pass
now plus a navigation pass after 6f is two design passes whose second one partly undoes the first.

**Phase A shipped anyway, and was worth shipping.** The primitive layer is a prerequisite for the
redesign under any ordering, and its absence was a *correctness* problem rather than a cosmetic one:
`empty`, `alert` and `sonner` did not exist, which is why the Definition of Done's four-states rule
was unsatisfiable. It is now satisfiable — see §3.

**A livability pass was considered and rejected.** The proposal was to apply the new primitives to
missing four-states gaps on daily-use pages, with no layout changes. Its whole justification was
reducing daily friction; the owner is not using the app until Phase 6 completes, so there is no
friction to reduce and the redesign supersedes the work regardless.

**This is not a frontend freeze.** Phase 6's own surfaces — workspace switching, members, roles —
are scoped inside each phase's spec and built minimally as those features land. Only the redesign
waits.

### Why the bugs go first

They are cheap, they are independent of Phase 6, and they are in surfaces the owner uses daily.
More importantly, 0009 undermines everything downstream: 0006 and 0010 both depend on agents
actually responding to input. Fixing it after building on top of it means debugging through
several layers instead of one.

Both are bugs, so `systematic-debugging` runs **before** any fix is proposed, and each gets a
failing regression test that reproduces it first — `CLAUDE.md`'s iron law, no exceptions.

### ~~Why 0006 Phase 1 comes before Phase 6 rather than after~~ — superseded

> **Superseded by the owner decision at the top of §2**, which moved 0006 after `6f` in full. This
> section is kept because its second argument is now an *unmet need* rather than a settled one, and
> that is worth carrying forward rather than deleting: with 0006 after 6f and the redesign after
> that, **nothing drives the Definition of Done's real-artifact test across 6a–6f**. Whatever
> verifies each phase has to be decided when that phase is specced.

The tension is real: building it now means it rides through the SQLite → Postgres swap and the
tenancy migrations. The counter-argument wins on two points.

The gym app and its agents and pipelines are **rows, not code** — they migrate with every other
row, on the same migrations, covered by the same per-migration tests. The re-work cost is close to
zero.

The benefit is not: 6a is described in its own spec as "the longest stretch in which success means
nothing looks different." A live project with real agents and a real pipeline is the only thing
that can actually demonstrate the app still works after each phase. Without it, the Definition of
Done's real-artifact usability test has nothing meaningful to drive for six consecutive phases.

**Scoped deliberately to Phase 1 only.** The recurring unattended build stays behind its safety
gates and lands at step 9.

---

## 3. The 6-pre finding — why it is a redesign

The UI adopted the shadcn/ui **look** without the shadcn/ui **components**. No MCP and no CLI were
wired when it was built, so the primitive layer was hand-approximated while the effort went to the
backend. Measured against Multica, which uses the same design system:

| | Sparstrowgen | Multica |
| --- | --- | --- |
| Primitives (`components/ui`) | **18** | **60** |
| Shared common components | 0 | 12 |
| Pages to cover | 24 | — |

The missing pieces are not decorative. **`empty`, `alert`, `sonner` (toast), and `field`/form did not
exist**, which meant `CLAUDE.md`'s "all four states, always" was unsatisfiable — the components it
presumes were never built. Also absent: `checkbox`, `radio-group`, `slider`, `toggle`, `popover`,
`hover-card`, `sheet`, `drawer`, `scroll-area`, `pagination`, `data-table`, `avatar`, `breadcrumb`,
`chart`, `progress`, `resizable`, `sidebar`.

**Resolved 2026-07-27 (Phase A).** The primitive layer went 18 → 26: `alert`, `empty`, `sonner`,
`checkbox`, `popover`, `scroll-area`, `breadcrumb`, `pagination`, all vendored from the shadcn MCP
and adapted to repo conventions. The four-states rule is now satisfiable. Four were deliberately
left out and recorded in `docs/deferred/`: `field`/`form` (no `<form>` element exists anywhere in
`packages/ui/src`, so it is a forms-architecture decision, not a swap), `radio-group` and `avatar`
(no consumer in the tree), and `data-table` — which the audit above lists as a missing primitive but
**is not a shadcn component at all**: the registry has 46 components and `data-table` is not among
them, only a documentation pattern over `table` + `@tanstack/react-table`.

Consequences worth naming:

- `0007`'s live dashboard needs `chart`, which does not exist. Another reason it sits behind 6-pre.
- `breadcrumb`, `sidebar` and `avatar` were hand-rolled during the `0012` Multica-theme redesign
  because no primitive was available — that work is re-doable on real primitives.
- Several list pages have no `pagination` and no `data-table`, so sorting and filtering are
  per-page inventions.

`0012` (shipped 2026-07-18) already took Multica's **layout**: app shell, sidebar groupings, dnd
pinned items, breadcrumbs, ⌘K palette. What it could not take was the primitive layer underneath.
That is what 6-pre is for.

Multica's `packages/views` is worth mining for surface patterns — `dashboard`, `inbox`, `search`,
`settings`, `onboarding`, `runtimes`, `skills`, `members` — on the standing parts-donor terms: adopt
the conclusion, never the Next.js shell.

## 4. Settled by the 2026-07-27 brainstorming session

This section previously read "open for the owner": 6-pre needed a design covering which pages in
what order, how far the redesign goes per page, and which Multica patterns are adopted. That session
happened, and it answered a different question than the one it was called to answer.

- **How far per page:** depth "surfaces" — information architecture reconsidered, not just a
  primitive swap, and not a navigation rewrite. Both narrower options were rejected: a mechanical
  primitive swap leaves the confusing pages confusing, and reopening navigation collides with
  Phase 6 changing what data exists.
- **Which pages in what order:** deferred with the redesign. A three-tranche cut was drafted (daily
  loop → workspace objects → planning and config) and is worth revisiting as a starting point, but
  it was drawn against today's page set, which the redesign may not preserve.
- **When:** after `6f`, not before `6a` — see §2.2. This is the session's substantive output, and it
  inverted the sequencing this document originally proposed.
- **Which Multica patterns:** still open. It is a question about surfaces, so it belongs to the
  revived spec rather than to this one.

Full record: `docs/deferred/2026-07-27-full-frontend-redesign.md`.

---

## 5. What happens to `docs/intake/`

0005 closes as shipped. The remaining six are represented by this document. Each becomes its own
spec in `docs/specs/` when its turn arrives — for 0006 by transcribing an approved design, for the
rest through `brainstorming`.

`docs/intake/` keeps its retired banner and takes no new entries.
