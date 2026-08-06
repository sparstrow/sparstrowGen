# TODOS

Deferred work captured by review skills. Each item: What / Why / Pros / Cons / Context /
Effort / Priority / Depends on.

## Auto-purge of trash after N days
- **What:** A scheduled job that permanently deletes projects sitting in trash longer than
  a configurable retention window (default 30 days).
- **Why:** Without it, `<dataDir>/deleted-projects/` grows unbounded and becomes manual
  filesystem upkeep — exactly the kind of chore this feature was meant to eliminate.
- **Pros:** Closes the loop on trash hygiene; reuses the existing dream-cycle-style
  scheduler pattern already in the codebase, not a new subsystem from scratch.
- **Cons:** New infra (a cron job) rather than a pure code change; needs a retention
  config knob and a way to warn the user before irreversible auto-purge fires.
- **Context:** Explicitly deferred by the plan's owner ("NOT in scope (yet)") in
  `docs/project-delete-plan.md`. An independent outside-voice review during
  `/autoplan`'s CEO phase (2026-07-11) flagged this as a high-severity 6-month regret if
  left unaddressed — surfaced as Taste Decision T-CEO-2 at the Final Approval Gate rather
  than silently added to the initial scope.
- **Effort:** S (human) → S (CC+gstack) — reuses existing scheduler infrastructure.
- **Priority:** P2
- **Depends on:** Project Delete v1 (`docs/project-delete-plan.md`) shipping first.

## Bulk delete / multi-select for Deleted Projects
- **What:** Select multiple trashed projects and restore or permanently delete them
  together, instead of one at a time.
- **Why:** Convenience once a user has more than a handful of trashed projects.
- **Pros:** Straightforward UI addition once the single-item flows exist.
- **Cons:** Separate feature surface, not blast-radius-adjacent to v1's file set.
- **Context:** Explicitly deferred by the plan's owner. Not reconsidered during
  `/autoplan` review — clean, uncontested deferral.
- **Effort:** M (human) → S (CC+gstack).
- **Priority:** P3
- **Depends on:** Project Delete v1 shipping first.

## Formal DESIGN.md
- **What:** Document the design system that already exists in practice (Dialog
  primitives, `text-destructive` confirm-gate pattern, App UI classification, spacing/
  typography tokens) via `/design-consultation`.
- **Why:** No `DESIGN.md` exists today; the only source of truth is a point-in-time
  design audit (`docs/reference/audits/2026-07-10-design-audit.md`) and reading the code directly.
- **Pros:** Future design reviews calibrate against a real spec instead of inferring
  conventions from recent commits each time.
- **Cons:** Pure documentation effort, no functional change.
- **Context:** Flagged by the `/autoplan` Design Review phase (2026-07-11) as a
  non-blocking gap while reviewing `docs/project-delete-plan.md`.
- **Effort:** M (human) → S (CC+gstack).
- **Priority:** P3
- **Depends on:** Nothing — can run anytime.

## General-purpose soft-delete/auto-purge primitive
- **What:** Generalize the soft-delete + trash + auto-purge pattern built for projects
  into a reusable primitive other entity types could adopt later.
- **Why:** Named as a 12-month "platonic ideal" direction during CEO review, not an
  immediate need.
- **Pros:** Avoids re-solving the same problem per entity type in the future.
- **Cons:** No second consumer exists today — building this now would be speculative
  generalization ahead of actual demand.
- **Context:** Captured in the CEO plan doc
  (`~/.gstack/projects/sparstrow-sparstrowGen/ceo-plans/2026-07-11-project-delete.md`)
  as a noted-not-pursued direction.
- **Effort:** XL (human) → L (CC+gstack).
- **Priority:** P3
- **Depends on:** A second concrete need for entity-level soft-delete emerging.
