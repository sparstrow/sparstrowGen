---
name: writing-plans
description: >-
  Step-by-step procedure for authoring or revising a doc/plans/*.md technical
  plan from an owner-reviewed spec, per doc/templates/plan.md:
  foundational-vs-per-story work breakdown, Decisions with rejected
  alternatives, contract/data-model delegation, and mapping the spec's
  SC-nnn criteria to Verification. Use whenever writing, revising, or
  reviewing a plan.
metadata:
  sparstrowgen-owner: architect
---

# Writing a doc/plans/*.md plan

Read `doc/templates/plan.md` and `.sparstrowgen/blueprint.yaml` (stack and
commands) before writing anything. The template's structure — header table
(Spec/Status/Depends on/Touches/Tasks/Open questions), a foundational-vs-
per-story Work breakdown, Decisions with rejected alternatives, Phases,
Scope boundaries, and Verification mapped to the spec's `SC-nnn` criteria —
is this repo's actual planning discipline, not a suggestion.

## Read the spec fully first

Including its Assumptions and any `[NEEDS CLARIFICATION]` markers still
open. An open `OQ-n` the spec references blocks only the part of the plan
that depends on it — plan around it per `AGENTS.md` §8's options framework,
don't stall the whole plan for one unresolved thread.

## Splitting the work

Use the plan template's own test: **can the owner see the result?** Yes →
per-story, grouped so each story's phase ends in something demoable. No →
foundational (schema, RLS, transport, sync) — it blocks the story work
behind it. A Work breakdown with stories and no rows under them is the exact
failure `doc/tasks/README.md` warns about: everything called foundational,
no story ever ships. Don't let that happen here.

## Decisions

For every load-bearing technical choice, write it under Decisions: the
choice, the alternative(s) rejected, and why. Six months from now the code
shows what was built; this section is the only place that shows why the
alternatives lost. Don't skip an entry because the choice felt obvious in
the moment.

## Contracts and data model — delegate, don't re-derive

If this plan defines or changes a shared request/response shape between
`apps/web` and `packages/core`, that's the `designing-shared-contracts`
skill's job, not this one. If it touches
`packages/shared/src/db/schema.ts` or needs a new table, that's the
`data-modeler` agent's job — see `data-modeling-and-rls` for its standards
if you're applying them directly instead of delegating. Incorporate either's
output as this plan's Decisions/Work-breakdown content rather than
re-deriving it from scratch.

## Verification

Map every one of the spec's `SC-nnn` success criteria to a concrete check
under Verification. If part of it can't be verified yet (no deployment, no
second machine, the platform won't deliver the signal), say so here — that
is what `doc/KnownGaps.md` is for, named early rather than discovered at the
end.

## Closing out

Leave `Status` as `Draft` until the plan is actually approved — the same
owner-gate discipline as the spec it came from. Never restate the spec's
reasoning in the plan — link it; one copy of "why," not two that drift
apart.
