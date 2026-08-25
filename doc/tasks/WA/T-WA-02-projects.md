# T-WA-02 — projects

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts` with every sibling; its own page files are exclusive |
| **Serves** | **foundational** — the largest single file in the phase |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `app/projects/actions.ts` — `provisionProjectAction`
- [ ] `app/projects/[projectId]/actions.ts` — update, create-variant, and the three directive writes
- [ ] `project-detail.tsx` and `projects.tsx` call the actions under `useTransition`
- [ ] The seven stub-backed hooks are untouched and still imported
- [ ] Delete only the six converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1) — this page's read has not moved
- [ ] `apps/web` typecheck and tests green

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

- [ ] `grep -rn "useUpdateProject\|useCreateVariant\|useCreateDirective\|useUpdateDirective\|useDeleteDirective\|useProvisionProject" apps/web/src` returns nothing
- [ ] Create a project through the New project dialog end to end — the path `BUG-2026-08-24-project-provision-always-400s` broke; it must still work
- [ ] Add, edit and delete a directive; each shows immediately
- [ ] Rename a project, then open `/projects` — the new name is there on arrival
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` during each converted action shows no `POST`/`PATCH`/`DELETE` to `/api/v1`
- [ ] Every converted button disables itself while its action is in flight
- [ ] One forced failure renders the **same message it renders today** (plan DD-3)

## On completion

- [ ] Tick 22.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
