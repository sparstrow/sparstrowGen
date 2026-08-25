# T-WA-01 — the convention, and `teams` as the worked example

| | |
|---|---|
| **Tag** | `[S]` — authors `lib/action-result.ts` and the pattern all seven sibling tasks copy; nothing else in the phase may start until it exists |
| **Serves** | **foundational** — unblocks T-WA-02 … T-WA-08 |
| **Depends on** | — |
| **Blocks** | T-WA-02, T-WA-03, T-WA-04, T-WA-05, T-WA-06, T-WA-07, T-WA-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Establish the Server Action convention — the result type, the auth preamble,
the pending-state shape — and prove it on `teams`, the one page whose read is
already a Server Component. Nine mutation call sites across `teams-client.tsx`
and `team-detail.tsx` convert; `POST/PATCH/DELETE /api/v1/teams*` handlers and
their hooks are deleted behind them.

## Why `teams` and not something smaller

`T-VR-05` already converted this page's read
([`page.tsx`](../../../apps/web/src/app/teams/page.tsx) queries Supabase
directly). That makes it the **only** page in the app where converting the
write completes the picture — action → `revalidatePath` → server re-render, one
round trip, no `invalidateQueries` bridge at all.

Every other task in this phase produces the intermediate state described in
plan DD-1, where the action is right and the refresh is still a cache
invalidation. If the worked example were one of those, seven tasks would be
copying a half-pattern and nobody would have seen the finished one.

`teams-client.tsx` also carries the exact comment that made `OQ-7` necessary —
*"Converting the write to a Server Action is a separate, later decision"* — so
this task is where that comment gets replaced by the answer.

## Decisions already made

### `revalidatePath("/teams")`, not `router.refresh()`

`teams-client.tsx` currently calls `router.refresh()` after the mutation
resolves. It goes. `revalidatePath` inside the action is strictly better here:
it runs before the action's response returns, so the client gets fresh RSC
payload in the same round trip instead of asking for one afterwards.

Delete the `useRouter()` import if nothing else in the file uses it.

### The two-step create stays two steps, and stays in the client

`submit()` creates a team and then, conditionally, sets its projects. **Do not
merge these into one action.** The current behaviour is deliberate and
commented: if project assignment fails, the team was still created, and the
dialog closes and refreshes anyway rather than stranding an invisible team.
Merging them into one server-side transaction would change that — the team
would roll back — which the phase README's "do not improve anything" trap
forbids.

Two actions, called in sequence from the client, preserving the existing
`onError` behaviour exactly.

### The auth preamble

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@web/utils/supabase/server";
import { getActiveWorkspaceId } from "@web/lib/workspace";
import { actionOk, actionFail, type ActionResult } from "@web/lib/action-result";

async function ctx() {
  const supabase = await createClient();
  const ws = await getActiveWorkspaceId(supabase);
  if (ws.error || !ws.workspaceId) return null;
  return { supabase, workspaceId: ws.workspaceId };
}
```

`getActiveWorkspaceId` already calls `supabase.auth.getUser()` internally and
returns `{ error: "Unauthorized", status: 401 }` when there is no session — so
this one call is both the auth check and the workspace resolution, and plan
DD-4 is satisfied by it. A `null` return becomes
`actionFail("Not signed in.")`, never a throw: an unauthenticated action call
is an expected failure, not a bug.

### Slug generation moves with the handler, not around it

`POST /api/v1/teams` generates a `slug`. Two bugs in this repo —
`BUG-2026-08-22-team-create-500-missing-slug` and
`BUG-2026-08-24-project-provision-always-400s` — were both "the insert didn't
generate a slug". Move that code verbatim into the action. Do not re-derive it.

## Checklist

- [ ] `apps/web/src/lib/action-result.ts` — `ActionResult`, `actionOk`, `actionFail`, per the phase README
- [ ] `apps/web/src/app/teams/actions.ts` — `createTeamAction`, `setTeamProjectsAction`
- [ ] `apps/web/src/app/teams/[teamId]/actions.ts` — the seven `team-detail.tsx` writes: update, delete, add member, update member, remove member, set projects, and the archive toggle
- [ ] `teams-client.tsx` — `useCreateTeam`/`useSetTeamProjects` replaced with direct action calls in `useTransition`; `router.refresh()` removed; error text sourced from `ActionResult`
- [ ] `team-detail.tsx` — same, for its seven
- [ ] Delete `useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`, `useAddTeamMember`, `useUpdateTeamMember`, `useRemoveTeamMember`, `useSetTeamProjects` from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useTeam`/`useTeams` queries stay
- [ ] Delete the corresponding write handlers from `apps/web/src/lib/api/handlers/teams.ts`; the `GET` handlers stay (plan DD-5)
- [ ] Replace `teams-client.tsx`'s "separate, later decision" comment with a one-line pointer to the plan
- [ ] `apps/web` typecheck and tests green

## Traps

**`getActiveWorkspaceId` returns co-members' rows and the handler filters
them.** Read its comment before copying anything: RLS deliberately exposes
co-member rows, and the `.eq("user_id", user.id)` filter is the correctness
boundary, not the security one. The helper already does this — call it, do not
reimplement the membership query inside an action.

**Deleting a write handler can break a test that imports the module.**
`apps/web/src/lib/api/*-routes.test.ts` files exercise handlers directly. A
deleted handler's tests are deleted with it; a deleted handler whose tests still
reference it is a red suite, and "comment out the failing test" is forbidden by
`AGENTS.md` §3.5. Delete the write-path tests, keep the read-path ones.

**`revalidatePath` needs the route the data renders on, not the route the
action lives in.** `team-detail.tsx`'s member changes affect `/teams/<id>`
**and** `/teams` (the member count on the card). Both paths, or the list shows a
stale count — the kind of regression that looks like nothing until someone
notices the number is wrong.

**An action file with a non-async export fails the build.** Every export from a
`"use server"` file must be an async function. The `ctx()` helper above is fine
because it is not exported; if a task ever needs to export a type from an
actions file, it does not — put it in `action-result.ts`.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `grep -rn "useCreateTeam\|useUpdateTeam\|useDeleteTeam\|useAddTeamMember\|useUpdateTeamMember\|useRemoveTeamMember\|useSetTeamProjects" apps/web/src` returns nothing
- [ ] Create a team with two projects selected: it appears in the list with the right project count, without a `router.refresh()` anywhere in the file
- [ ] Create a team with a name that fails validation: the dialog shows the **same message it shows today**, not a redacted digest (plan DD-3)
- [ ] `read_network_requests` during a create shows **no** `POST /api/v1/teams`
- [ ] Add a member on `/teams/<id>`, then go back to `/teams`: the member count on the card is correct (both `revalidatePath` targets)
- [ ] The create button is disabled while the action is in flight

## On completion

- [ ] Tick 22.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
