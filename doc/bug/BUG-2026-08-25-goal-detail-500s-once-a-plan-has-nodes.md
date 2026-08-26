# BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes

**Status:** 🔴 open
**Reported by:** agent — found while verifying `T-WA-04`'s Server Action conversion live
**Reported:** 2026-08-25

## Symptom

`GET /goals/:id` — the goal detail page's entire data source — 500s with
"Internal Server Error" for any goal whose plan has at least one node. The
page renders nothing but a `Tasks` back-link and the error text.

## Reproduction

1. Insert a `goals` row with `plan_version >= 1`, and one `plan_nodes` row
   for it with `task_id` pointing at a real `tasks` row.
2. Open `/tasks/goals/<id>`.
3. The page shows "Internal Server Error"; the dev server log shows:
   ```
   API Route Error: {
     code: 'PGRST200',
     details: "Searched for a foreign key relationship between 'plan_nodes' and 'tasks' in the schema 'public', but no matches were found.",
     message: "Could not find a relationship between 'plan_nodes' and 'tasks' in the schema cache"
   }
   ```

Reproduced live 2026-08-25 against a fixture goal + plan node inserted
directly in a fresh disposable workspace.

## Investigation

`GET /goals/:id` (`apps/web/src/lib/api/handlers/goals.ts`) queries
`plan_nodes` with PostgREST's embedded-relationship syntax:
`.select("*, tasks(*)")`. That syntax requires a real foreign key constraint
between the two tables in Postgres's schema cache — PostgREST introspects the
FK graph to know how to join. `packages/shared/src/db/schema.ts`'s
`planNodes.taskId` is a plain `text("task_id")` column with **no
`.references()` call** (unlike, e.g., `taskQuestions.taskId`, which does
reference `tasks.id`). No FK exists, so the embedded join can never resolve,
and the query always throws — unconditionally, for every goal that has
advanced past `plan_version: 0` with at least one node.

This predates `T-WA-04` (unchanged since M3, `#80`, same commit as
`BUG-2026-08-25-skill-detail-page-always-crashes`) and is not something this
task's write conversion touched — `T-WA-04`'s `cancelGoalAction` and
`retryNodeAction` write to `goals`/`plan_nodes` directly via `supabase-js`
(no embedded-relationship syntax), so they are unaffected by this specific
join failure. But since `useCreateGoal` is itself stub-backed (`POST /goals`
is a 501) and nothing else creates a goal with real plan nodes, this page has
likely never successfully rendered a goal with an actual plan — which is the
whole point of the page.

## Impact

**High** — the goal detail page is the entire user-facing surface for
watching a plan execute (the node graph, per-node retry/cancel, pause/resume).
Once a goal has a plan (`plan_version >= 1`, which is the normal, expected
state almost immediately after creation), the page is completely unusable.

## Resolution

*Open. Fix: add the missing FK — `planNodes.taskId` should
`.references(() => tasks.id, { onDelete: "set null" })` (nullable, since a
node need not always have a linked task) — via a migration, then PostgREST's
schema cache will resolve the embedded join. Whichever task next builds real
goal creation (closing the `useCreateGoal` stub) should treat this as a
blocking prerequisite, not an unrelated follow-up — it will hit this
immediately on the first real goal with a plan.*
