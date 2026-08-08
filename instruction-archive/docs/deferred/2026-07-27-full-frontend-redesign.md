# Full frontend redesign — the 24 pages and the navigation

- **source:** owner decision, 2026-07-27 (brainstorming session)
- **project:** factory
- **size:** XL
- **date:** 2026-07-27
- **links:** `docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` §2, §3

**What:** the redesign of all 24 pages in `packages/ui/src/routes/pages/` (~10,000 lines), plus the
navigation and page set themselves. Two depths that were originally going to be separate passes,
now deliberately merged into one:

- **surfaces** — each page's information architecture reconsidered against the vendored primitive
  layer: what belongs on it, what it leads with, real sorting and filtering, and the four states
  the Definition of Done requires. Mines Multica's `packages/views` for surface patterns on the
  standing parts-donor terms.
- **navigation** — the app shell, route set and groupings reopened. Pages may merge, split or
  disappear. The `0012` shell stops being fixed.

**Why deferred:** this was `6-pre`, sequenced *before* `6a`. The owner moved it behind the whole of
Phase 6 on 2026-07-27, and the reasoning is worth keeping because it is not the obvious one.

The weak argument for deferring is rework — pages built now get disturbed by the migrations. That
argument is real but small, and could have been mitigated by keeping data access in the
`@/api/hooks` layer.

The strong argument is that the mitigation only protects the *plumbing*. Twenty-four surfaces
designed while a single workspace is the only workspace encode that assumption as **design**, not
as wiring: empty states that say "No agents yet" rather than "No agents in this workspace", headers
with nowhere to show which workspace you are in, action buttons that should be hidden from a viewer
role. No hook-layer discipline catches those. Designing against real tenancy produces a different
design, not a differently-wired one.

Merging the two depths follows from the same point. Navigation should express the feature set, and
Phase 6 introduces workspaces, members, roles and run metrics — genuinely new navigational
concepts. Splitting the work into a surfaces pass now and a navigation pass after `6f` would pay
for two design passes whose second one partly undoes the first.

A smaller "livability" pass — applying the vendored primitives to missing four-states gaps, with no
layout changes — was considered and dropped on 2026-07-27. Its entire justification was reducing
daily friction, and the owner is not using the app until Phase 6 completes. With no daily use there
is no friction to reduce, and the redesign replaces that work anyway.

**Revisit when:** `6f` is complete and the hosted multi-tenant foundation is live. At that point
write a fresh spec in `docs/specs/` — and expect it to decompose into tranches, because depth
"surfaces + navigation" across 24 pages will not fit a single spec or a single plan.

**Not blocked by this deferral:** Phase 6's *own* user-facing surfaces. `6c`/`6d` introduce
workspaces, members and roles, which need some UI to be usable at all. That UI is scoped inside
each phase's own spec and built minimally as those features land. Only the redesign waits — this is
not a freeze on all frontend work.

**Already done, and not stranded:** the primitive layer. 26 components now live in
`packages/ui/src/components/ui/` (18 before, plus `alert`, `empty`, `sonner`, `checkbox`, `popover`,
`scroll-area`, `breadcrumb`, `pagination`). The redesign depends on them either way; only the payoff
moved. See also `2026-07-27-form-primitives.md`, `2026-07-27-radio-group-primitive.md`,
`2026-07-27-avatar-primitive.md` and `2026-07-27-data-table.md` — four primitives deliberately not
vendored, each of which the redesign is the natural trigger for.
