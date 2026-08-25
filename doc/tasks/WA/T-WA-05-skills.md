# T-WA-05 — skills

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `useUpdateSkill`/`useDeleteSkill` span both its files |
| **Serves** | **foundational** — the skills list and detail |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `app/skills/actions.ts` — `createSkillAction`, `updateSkillAction`, `deleteSkillAction`
- [ ] `skills.tsx` and `skill-detail.tsx` call them under `useTransition`
- [ ] `useImportLocalSkill` and `useImportUrlSkill` untouched
- [ ] Deleting a skill from the detail page still navigates back to `/skills`
- [ ] Delete the three converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useSkill`/`useSkills`/`useSkillAssignments` queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

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

- [ ] `grep -rn "useCreateSkill\|useUpdateSkill\|useDeleteSkill" apps/web/src` returns nothing
- [ ] Delete a skill from its detail page: it navigates to `/skills` and the skill is already gone on arrival, not after a manual refresh
- [ ] Edit a skill's content and reload — the change persisted
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/skills` (the two import paths excepted)
- [ ] Every converted button disables itself while its action is in flight

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
