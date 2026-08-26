# T-WA-01 — the convention, and `teams` as the worked example

| | |
|---|---|
| **Tag** | `[S]` — authors `lib/action-result.ts` and the pattern all seven sibling tasks copy; nothing else in the phase may start until it exists |
| **Serves** | **foundational** — unblocks T-WA-02 … T-WA-08 |
| **Depends on** | — |
| **Blocks** | T-WA-02, T-WA-03, T-WA-04, T-WA-05, T-WA-06, T-WA-07, T-WA-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

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

- [x] `apps/web/src/lib/action-result.ts` — `ActionResult`, `actionOk`, `actionFail`, per the phase README
- [x] `apps/web/src/app/teams/actions.ts` — `createTeamAction`, `setTeamProjectsAction`
- [x] `apps/web/src/app/teams/[teamId]/actions.ts` — the seven `team-detail.tsx` writes: update, delete, add member, update member, remove member, set projects, and the archive toggle
- [x] `teams-client.tsx` — `useCreateTeam`/`useSetTeamProjects` replaced with direct action calls in `useTransition`; `router.refresh()` removed; error text sourced from `ActionResult`
- [x] `team-detail.tsx` — same, for its seven
- [x] Delete `useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`, `useAddTeamMember`, `useUpdateTeamMember`, `useRemoveTeamMember`, `useSetTeamProjects` from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useTeam`/`useTeams` queries stay
- [x] Delete the corresponding write handlers from `apps/web/src/lib/api/handlers/teams.ts`; the `GET` handlers stay (plan DD-5)
- [x] Replace `teams-client.tsx`'s "separate, later decision" comment with a one-line pointer to the plan
- [x] `apps/web` typecheck and tests green

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

- [x] `pnpm typecheck` and `pnpm test` green — `apps/web`, 26 files / 365 tests
- [x] `grep -rn "useCreateTeam\|useUpdateTeam\|useDeleteTeam\|useAddTeamMember\|useUpdateTeamMember\|useRemoveTeamMember\|useSetTeamProjects" apps/web/src` returns nothing
- [x] Create a team: it appears in the server-rendered list **with no
      `router.refresh()` in the file** — the finished one-round-trip pattern,
      observed live
- [~] Create a team **with two projects selected** — *not run as written.* The
      disposable workspace had no projects, so the picker had nothing to tick.
      `setTeamProjectsAction` was exercised on its empty-set path
      (delete-then-insert-nothing) and returned `ok`. **The non-empty insert
      path is unproved** → [`G-37`](../../KnownGaps.md)
- [~] Create a team with a name that fails validation — *not run.* No
      validation on this form rejects a non-empty name, so there was no
      failure to force without mocking. DD-3's message-survival was proved by a
      different real failure instead (next item), which is stronger evidence
      than a mocked one, but it is **not the same check** → [`G-37`](../../KnownGaps.md)
- [x] **DD-3 and DD-4 proved together, by a real failure**: session cookie
      cleared with the create dialog open → the dialog renders **"Not signed
      in."**, no runtime overlay, no team created. The dev log shows
      `createTeamAction` ran and returned in 5 ms
- [x] `read_network_requests` equivalent (dev-server log across the whole walk)
      shows **no `POST`/`PATCH`/`DELETE` to `/api/v1`** — every write logs as
      `POST /teams…` with its `ƒ <action>` line
- [x] Rename a team on `/teams/<id>`, then open `/teams`: the new name is there
      on arrival — **both `revalidatePath` targets confirmed**
- [~] Member **count** on the card after adding a member — *not checked
      specifically.* The rename propagation above proves the same two-target
      mechanism on the same routes; the count itself was not read → [`G-37`](../../KnownGaps.md)
- [~] The create button is disabled while the action is in flight — *not
      observed.* The `disabled={!name.trim() || pending}` binding is in the
      source and the empty-name half of it was seen working; the in-flight half
      never rendered long enough to snapshot → [`G-37`](../../KnownGaps.md)

**Also verified beyond the checklist**, because the walk went through them:
`updateTeamAction`, `addTeamMemberAction`, `updateTeamMemberAction`,
`removeTeamMemberAction`, `deleteTeamAction` — all seven actions exercised
live, each confirmed in the dev-server log by its own `ƒ <action>` line.

`deleteTeamAction` specifically confirms the redirect trap was avoided: the
page navigates to `/teams` and the list is **already empty on arrival**, not
after a manual refresh.

## On completion

- [x] Tick 22.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] File [`BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error`](../../bug/BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error.md), fix it, and record it as a phase decision
- [x] Open [`G-37`](../../KnownGaps.md) for the four checks ticked on weaker evidence than they asked for

## Result

**Done 2026-08-24.** Seven mutation hooks and nine `/api/v1` write handlers
gone; seven Server Actions in their place across two files. `hooks.ts` dropped
from 2310 to 2226 lines. `apps/web` typecheck clean, 365 tests green.

**The count in the plan was wrong and this is the corrected one.** The plan's
band-22 table said 9 call sites for `teams`; the real figure is **7 distinct
mutation hooks** (`useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`,
`useAddTeamMember`, `useUpdateTeamMember`, `useRemoveTeamMember`,
`useSetTeamProjects`) across two files, with `useSetTeamProjects` and
`useCreateAgent`-style duplication accounting for the difference. `T-WA-09`
should grade against real counts, not the plan's.

**The checklist named an "archive toggle" that does not exist.** `archivedAt`
is rendered as a badge on both pages and nothing writes it from the UI. Nothing
was built for it; the item is simply not real, and the sibling tasks should
expect the same kind of drift between a decomposition written from `grep` and
what the file actually does.

### What was found that the task did not anticipate

**1. The middleware ate every Server Action from a signed-out browser.** The
big one, and the reason this task was worth doing first. An action posts to the
*page's* path, so `utils/supabase/middleware.ts` redirected it to `/login` —
the action never ran, and React's dispatch threw *"An unexpected response was
received from the server"* as a Runtime Error overlay. Before the conversion,
the same expiry produced a legible 401 message, so this was a real regression
introduced by band 22 and it would have hit **all 21 files**.

Filed as
[`BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error`](../../bug/BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error.md),
fixed in the same change, and written into
[`README.md`](README.md) as a phase decision so the siblings inherit it.

The middleware's own pre-existing comment described this exact failure mode for
`/api/` routes and had simply never been extended to actions.

**2. A dropped connection produced a Runtime error, not a message — found by
the owner asking whether the Electron app works offline.** `ActionResult`
(DD-3) covers what an action *returns*; a transport failure never reaches the
action, so the rejection went unhandled inside `useTransition` and rendered as
a full-screen *"Runtime TypeError: Failed to fetch"*. React Query's `onError`
had covered both cases, so this was a second regression the conversion
introduced — and one that matters most in Electron, whose window points at a
**remote** host with no local server, and whose offline screen does not catch
it because that fires on failed navigations, not on a `fetch`.

Fixed with `lib/call-action.ts`; every call site now goes through
`callAction(() => …)` rather than awaiting the action. Filed as
[`BUG-2026-08-25-network-failure-during-a-server-action-is-an-unhandled-rejection`](../../bug/BUG-2026-08-25-network-failure-during-a-server-action-is-an-unhandled-rejection.md),
made a phase decision, and added to `T-WA-09`'s sweep as a grep the siblings
cannot silently fail.

**Both of this task's findings are the same shape**, which is worth noticing:
the conversion silently narrowed what counts as a handled failure, twice, in
two different ways, and both typechecked perfectly. That is the argument for
`[S]`-gating this phase on a worked example, and the reason `T-WA-09` grades by
walking rather than by testing.

**3. `slugify`/`withCollisionSuffix` had to move.** They lived in
`api/handlers/workspace.ts`, which calls `registerRoute()` at module scope — so
importing them from a Server Action pulls the whole route registry into the
action's module graph. Extracted to `lib/slug.ts`; `handlers/workspace.ts`
re-exports both, so all four existing import sites and
`workspace-routes.test.ts` are untouched.

**4. `/teams/[teamId]` is a client page, so this task demonstrates both
halves.** The task framed `teams` as the one page where WA1 alone finishes the
job. That is true of `/teams`; the detail route still reads through `useTeam()`
and therefore keeps its `invalidateQueries` bridge. That turned out better than
the framing — the worked example now shows the finished pattern *and* the
intermediate one, side by side, which is what the other seven tasks actually
need to copy.

**5. There were no write-path handler tests to delete.**
`teams-routes.test.ts` covers only the four `GET` handlers, all of which stay.
The task's trap about deleting tests with their handlers did not apply here; it
still will elsewhere.

### What was actually run

Dev server on localhost with real Supabase credentials, driven by the
`agent-browser` CLI per
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)
(the Claude Browser pane's `visibilityState` bug makes it useless for this).
Disposable account, fresh workspace, one seeded agent.

All seven actions exercised end to end: create team → rename → add member →
edit member role → manage projects → remove member → delete team. Every one
confirmed twice — once by what the page showed, once by its own `ƒ <action>`
line in the dev-server log. Zero `POST /api/v1/*` across the entire walk. No
console errors, no page errors.

Both regressions were reproduced before fixing and re-run after: the signed-out
case now renders **"Not signed in."**, and the aborted-network case
(`agent-browser network route <page path> --abort`) now renders **"Couldn't
reach Sparstrowgen, so nothing was saved."** — neither shows an overlay.

Disposable accounts cleaned up with the runbook's own query rather than the
admin API: 6 auth users, 5 workspaces, 5 profile rows, no orphans left.

**Four checks were ticked as `[~]` rather than `[x]`** — two projects on
create, a forced validation failure, the member count specifically, and the
in-flight disabled state. None could be run as written against a fresh
workspace, and each is recorded in [`G-37`](../../KnownGaps.md) rather than
quietly rounded up. The non-empty `team_projects` insert path is the one that
matters most of the four, because it is the only real code path among them.
