# BUG-2026-08-26-blocked-project-actions-reassign-and-relink-always-404

**Status:** 🟢 resolved
**Reported by:** agent — converting `T-WA-08`'s `machines.tsx`/`blocked-project-actions.tsx` writes to Server Actions
**Reported:** 2026-08-26

## Symptom

When a task is blocked because its target machine does not have the project on
disk, two of the four affordances `blocked-project-actions.tsx` offers
silently do nothing: "Run on `<other machine>`" (reassign) never moves the
task back to `todo` on the new machine, and successfully relinking a project
path never clears the blocked state either — the task stays exactly where it
was, with no error shown.

## Reproduction

1. Get a task into `blocked` with `targetRuntimeId` set (M4's
   `project_not_available` path).
2. Click "Run on `<machine>`" (when another online machine already has the
   project bound), or relink the original machine to a real path.
3. Expected: the task returns to `todo`. Actual: `PUT /api/v1/tasks/<id>`
   404s — no such route — and the component's `updateTask.mutate(...)` call
   silently fails (no `onError` handler was attached at either call site, so
   nothing surfaced the failure at all).

## Investigation

`useUpdateTask()` (`apps/web/src/api/hooks.ts`) sends `PUT /tasks/${id}`.
`apps/web/src/lib/api/handlers/tasks.ts` registers the update route as
**`PATCH /tasks/:id`**, not `PUT` — the router (`router.ts#matchRoute`)
matches on exact HTTP method, so a `PUT` never finds it. Same shape as
`BUG-2026-08-26-agent-update-always-404s`: the handler's own update logic (a
plain `.update(body)` scoped to `workspace_id` + `id`) is correct; only the
verb the two sides agreed on differs.

`blocked-project-actions.tsx` was the last live consumer of `useUpdateTask()`
— `T-WA-04` and `T-WA-06` both found and left it in place for exactly this
component (per the phase README's "delete only after the last consumer is
gone" rule) without noticing the hook itself was broken, since neither task's
file list included this component.

## Impact

Two of the four blocked-task recovery actions have never worked through the
UI: reassigning to an already-bound online machine, and clearing the blocked
state after a successful relink. The task simply sits blocked forever with no
visible error — "Unbind" and "Clone it there" (different hooks, working
routes) were the only two of the four that ever did anything.

## Resolution

Fixed by `T-WA-08`'s Server Action conversion: `updateTaskAction`
(`apps/web/src/app/tasks/actions.ts`, built by `T-WA-04`) calls the database
directly — there is no HTTP verb in the path to mismatch — so converting
`blocked-project-actions.tsx`'s two call sites onto it fixes this as a side
effect. `useUpdateTask()` itself is now deleted from `hooks.ts` (this was its
last consumer, confirmed by grep); the real `GET`/`PATCH /tasks/:id` routes it
never actually reached are untouched.

Not verified live — reproducing needs a blocked task with a real
`targetRuntimeId`, which needs either a second paired machine or hand-seeded
`runtime_projects`/`tasks` rows, judged out of proportion to what it would
prove (see `T-WA-08`'s `KnownGaps.md` entry). `updateTaskAction`'s own
behaviour is already covered by `T-WA-04`'s tests; what this fix adds is
purely the call site, and there is no HTTP verb left for the new call site to
get wrong.
