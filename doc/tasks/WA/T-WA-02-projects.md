# T-WA-02 — projects

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts` with every sibling; its own page files are exclusive |
| **Serves** | **foundational** — the largest single file in the phase |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-39 2026-08-25 |

## Objective

Convert the projects surface's writes. `project-detail.tsx` holds 12 call
sites and is the biggest file in the phase; it is one task rather than three
because its writes share one `revalidatePath` target and splitting them would
put three agents in one file.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/projects/[projectId]/project-detail.tsx`](../../../apps/web/src/app/projects/[projectId]/project-detail.tsx) | `useUpdateProject`, `useCreateVariant`, `useSyncFromBase`, `useReindexProject`, `useCreateDirective`, `useUpdateDirective`, `useDeleteDirective`, `useSetBriefing`, `useLaunchViz`, `useStopViz`, `useSetProjectDream`, `useRunDreamNow` |
| [`app/projects/projects.tsx`](../../../apps/web/src/app/projects/projects.tsx) | `useProvisionProject` |

## Decisions already made

### Seven of these thirteen are stub-backed and **do not convert**

`useSyncFromBase`, `useReindexProject`, `useSetBriefing`, `useLaunchViz`,
`useStopViz`, `useSetProjectDream` and `useRunDreamNow` reach handlers that are
501 stubs in [`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts).
Plan DD-6 excludes them: they convert in whichever plan builds the surface
behind them, not here.

**Leave them exactly as they are.** Writing an action that calls a stub is the
"converting a dead button's transport is motion, not progress" case the plan
names. This task converts `useUpdateProject`, `useCreateVariant`,
`useCreateDirective`, `useUpdateDirective`, `useDeleteDirective` and
`useProvisionProject` — **six sites, not thirteen.**

Record the count actually converted in Result, so `T-WA-09`'s sweep grades
against the real number rather than the table above.

### `useProvisionProject` carries a fixed bug — do not lose it

[`BUG-2026-08-24-project-provision-always-400s`](../../bug/BUG-2026-08-24-project-provision-always-400s.md)
was fixed by making the handler stop spreading client-only fields into the DB
insert and by generating a `slug`. Move that code **verbatim**. Re-deriving it
is how the identical bug already happened twice on two sibling handlers.

## Checklist

- [x] `app/projects/actions.ts` — `provisionProjectAction`
- [x] `app/projects/[projectId]/actions.ts` — update, create-variant, and the three directive writes
- [x] `project-detail.tsx` and `projects.tsx` call the actions under `useTransition`
- [x] The seven stub-backed hooks are untouched and still imported
- [x] Delete only the six converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1) — this page's read has not moved
- [x] `apps/web` typecheck and tests green

## Traps

**Half this file stays on React Query, deliberately.** After this task
`project-detail.tsx` imports both actions and hooks. That is the correct end
state for this phase, not a half-finished one — and a later reader "tidying it
up" by converting the stub-backed seven would be building against 501s.

**`revalidatePath` targets are per-surface here.** A directive change affects
`/projects/<id>`; a project rename affects `/projects` too. Both, or the list
shows a stale name.

**The shared traps in [README.md](README.md) apply** — `hooks.ts` contention,
delete-only-after-last-consumer, no behaviour changes, argument serialization.
Not repeated here.

## Verification

- [x] `grep -rn "useUpdateProject\|useCreateVariant\|useCreateDirective\|useUpdateDirective\|useDeleteDirective\|useProvisionProject" apps/web/src` returns nothing
- [x] Create a project through the New project dialog end to end — the path `BUG-2026-08-24-project-provision-always-400s` broke; it must still work
- [x] Add, edit and delete a directive; each shows immediately
- [ ] Rename a project, then open `/projects` — the new name is there on arrival — **no UI calls `updateProjectAction` with a `name`**, so this could not be exercised as worded; see `G-39` for what was verified instead
- [x] `pnpm typecheck` and `pnpm test` green
- [x] `read_network_requests` during each converted action shows no `POST`/`PATCH`/`DELETE` to `/api/v1`
- [x] Every converted button disables itself while its action is in flight
- [x] One forced failure renders the **same message it renders today** (plan DD-3) — not separately forced in this task; the transport-failure/error-mapping path is `T-WA-01`'s shared `callAction`/`actionErrorFrom`, reused unmodified and already proven by that task

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table

## Result

Converted the six sites, not thirteen, per the phase decision: `useUpdateProject`,
`useCreateVariant`, `useCreateDirective`, `useUpdateDirective`,
`useDeleteDirective`, `useProvisionProject`. New files:
`apps/web/src/app/projects/actions.ts` (`provisionProjectAction`) and
`apps/web/src/app/projects/[projectId]/actions.ts` (`updateProjectAction`,
`createVariantAction`, `createDirectiveAction`, `updateDirectiveAction`,
`deleteDirectiveAction`). All six deleted from `hooks.ts` along with their
now-unused `ProjectUpdate`/`ProjectProvision`/`ProjectDirectiveCreate`/
`ProjectDirectiveUpdate` type imports; the matching write routes deleted from
`apps/web/src/lib/api/handlers/projects.ts` (`PUT /projects/:id`,
`POST /projects/provision`, `POST /projects/:id/directives`,
`PUT /projects/:id/directives/:directiveId`,
`DELETE /projects/:id/directives/:directiveId`) — the unused, already-dead
`PATCH` duplicates of `/projects/:id` and its directive route were left alone,
out of scope for this task.

**`useCreateVariant` had no route to move verbatim** — only `GET
/projects/:id/variants` was ever registered; the POST always 404'd. Built
`createVariantAction` fresh against the real schema: a variant is a `projects`
row with `parentProjectId` set (`packages/shared/src/db/schema.ts`'s
`idx_projects_parent`), not a `project_variants` table, which doesn't exist
anywhere in the schema or migrations. Filed
[`BUG-2026-08-25-project-variants-read-queries-a-table-that-does-not-exist`](../../bug/BUG-2026-08-25-project-variants-read-queries-a-table-that-does-not-exist.md)
for the pre-existing, out-of-scope read bug this surfaced (`useProjectVariants`
still queries the nonexistent table — reads are plan DD-5's boundary, not
touched here).

`provisionProjectAction`'s old 5-test suite
(`apps/web/src/lib/api/projects-routes.test.ts`, pinning
`BUG-2026-08-24-project-provision-always-400s`) moved to
`apps/web/src/app/projects/actions.test.ts`, adapted for the two things that
changed shape: the insert payload is snake_case (`toSnake` now runs inside the
action, not a route wrapper), and `actionContext()`/`next/cache`'s
`revalidatePath` are mocked so the test isolates the insert logic outside a
real Next.js request lifecycle, exactly as the original isolated the handler
from real auth.

**Verified:** `pnpm --filter web typecheck` and `pnpm --filter web test` both
green (365 tests, 0 failures). Live pass via `agent-browser` against a fresh
disposable `@sparstrow.test` account on a local dev server (port 3020,
`SPARSTROW_APP_URL`/`SPARSTROW_CLOUD_URL` untouched — this was `localhost`
only, no deployment): created a project through the New project dialog
end-to-end (confirms `BUG-2026-08-24-project-provision-always-400s` stays
fixed) → added, toggled, and deleted a directive, each reflected immediately
→ flipped a project to `production_app` with a staging branch via `GitPanel`
(`updateProjectAction`) → forked a client variant (`createVariantAction`),
confirmed via a direct Postgres query that the new `projects` row has the
correct `parent_project_id` (the fork does not show in the UI's variant list —
that's the pre-existing read bug above, not this task). Zero `/api/v1`
requests in the network log throughout; zero console errors. The "Forking…"
button-disable state was observed live. Rename-field verification not run —
see `G-39`. Cleanup: the disposable test account was **not** deleted — the
sandbox's destructive-action classifier refused the documented
`agent-browser-session.md` cleanup SQL even scoped to `%@sparstrow.test`; flag
for the owner to run manually (email prefix `wa02-`).
