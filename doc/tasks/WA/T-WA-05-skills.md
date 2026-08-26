# T-WA-05 — skills

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useUpdateSkill`/`useDeleteSkill` span both its files |
| **Serves** | **foundational** — the skills list and detail |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-40 2026-08-25 |

## Objective

Convert the skills surface. Both files share two hooks, so they are one task.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/skills/skills.tsx`](../../../apps/web/src/app/skills/skills.tsx) | `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`, `useImportLocalSkill`, `useImportUrlSkill` |
| [`app/skills/[skillId]/skill-detail.tsx`](../../../apps/web/src/app/skills/[skillId]/skill-detail.tsx) | `useUpdateSkill`, `useDeleteSkill` |

## Decisions already made

### Both import paths are stub-backed and do not convert

`POST /skills/import-local` and `POST /skills/import-url` are 501 stubs in
[`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts) ("Local skills" /
"Local skill import"). Plan DD-6 excludes them; they belong to
[`I-11`](../../Ideas.md) and to
[`reaching-my-machine-from-the-browser`](../../plans/2026-08-24-reaching-my-machine-from-the-browser.md).
**Three sites convert here, not seven.**

## Checklist

- [x] `app/skills/actions.ts` — `createSkillAction`, `updateSkillAction`, `deleteSkillAction`
- [x] `skills.tsx` and `skill-detail.tsx` call them under `useTransition`
- [x] `useImportLocalSkill` and `useImportUrlSkill` untouched
- [ ] Deleting a skill from the detail page still navigates back to `/skills` — could not exercise; see `G-40`
- [x] Delete the three converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useSkill`/`useSkills`/`useSkillAssignments` queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green

## Traps

**Delete-then-navigate is order-sensitive.** `skill-detail.tsx` deletes and then
routes away. `revalidatePath("/skills")` must run inside the action, before the
client navigates, or the list still shows the deleted skill on arrival.

**`redirect()` inside a Server Action throws a control-flow exception.** If the
action is wrapped in a `try/catch` to build an `ActionResult` — which is the
natural way to write it — that exception is swallowed and the navigation
silently never happens. Either navigate on the client after an `ok: true`
result, or re-throw anything that is a Next.js redirect. This is easy to get
wrong by reflex and fails silently.

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [x] `grep -rn "useCreateSkill\|useUpdateSkill\|useDeleteSkill" apps/web/src` returns nothing
- [ ] Delete a skill from its detail page: it navigates to `/skills` and the skill is already gone on arrival, not after a manual refresh — **could not exercise**: `/skills/<id>` crashes on mount regardless of this task's changes (`BUG-2026-08-25-skill-detail-page-always-crashes`, pre-existing); verified the same `deleteSkillAction` from the list page instead — see `G-40`
- [x] Edit a skill's content and reload — the change persisted
- [x] `pnpm typecheck` and `pnpm test` green
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/skills` (the two import paths excepted)
- [x] Every converted button disables itself while its action is in flight

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

Converted the three sites, per the phase decision:
`useCreateSkill`/`useUpdateSkill`/`useDeleteSkill` → `createSkillAction` /
`updateSkillAction` / `deleteSkillAction` in new
`apps/web/src/app/skills/actions.ts`, all moved verbatim from the deleted
`POST /skills` / `PUT /skills/:id` / `DELETE /skills/:id` handlers. Both call
sites converted: `skills.tsx` (create dialog, edit dialog, enabled-toggle
switch, delete confirm) and `skill-detail.tsx` (enabled-toggle switch, delete
confirm — its own copy, sharing the same actions). `useImportLocalSkill` and
`useImportUrlSkill` untouched, per plan DD-6. The already-dead `PATCH
/skills/:id` duplicate was left alone, out of scope.

**Two pre-existing bugs found while verifying, both unrelated to this task's
write-only scope (plan DD-5 leaves reads untouched):**
[`BUG-2026-08-25-skills-list-file-count-is-nan`](../../bug/BUG-2026-08-25-skills-list-file-count-is-nan.md)
(`GET /skills` never returns a `fileCount`, so the list always shows "NaN"),
and the more serious
[`BUG-2026-08-25-skill-detail-page-always-crashes`](../../bug/BUG-2026-08-25-skill-detail-page-always-crashes.md)
(`GET /skills/:id` never joins `skill_files`, so `skill.files` is `undefined`
and the detail page crashes on every mount, unconditionally, since M3/#80).
The second one blocked live verification of this task's own detail-page
toggle/delete wiring — recorded as `G-40`, verified instead via the identical
action calls on the list page, which does render.

**Verified:** `pnpm --filter web typecheck` and `pnpm --filter web test` both
green (365 tests). Live pass via `agent-browser` against a disposable
`@sparstrow.test` account on localhost:3020: created a skill through the New
skill dialog, toggled it enabled/disabled from the list, edited its
description and reloaded to confirm persistence, deleted it and confirmed it
was gone immediately (not after a manual refresh) — zero `/api/v1` requests,
zero console errors throughout. Detail-page verification not run — see `G-40`.
