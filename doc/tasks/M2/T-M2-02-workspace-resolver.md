# T-M2-02 — Workspace resolver + first-login bootstrap

| | |
|---|---|
| **Tag** | `[P]` parallel — no shared files |
| **Depends on** | nothing |
| **Blocks** | T-M2-03 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | done 2026-08-10 |

## Objective

Every cloud table is workspace-scoped. Resolve the caller's active workspace
server-side, and create one on first login so a new user isn't staring at a dead
app.

## Decisions already made

- **Clients never send `workspace_id`.** The handler stamps it on every insert.
  A client that supplies one has it overwritten — it is not an error, it is
  ignored, because trusting it would let a member write into another workspace
  in the one place RLS's `with check` is most easily fumbled.
- **Bootstrap happens on first authenticated request**, not at signup. Signup
  goes through Supabase Auth, which knows nothing about workspaces.
- **More than one membership requires an explicit `?workspaceId=`.** No picker
  UI — deferred, `Deferred.md` D-7.

## Checklist

- [x] Create `apps/web/src/lib/workspace.ts`
- [x] `getActiveWorkspaceId(supabase, searchParams)` returning
      `{ workspaceId }` or `{ error, status }`
- [x] Query `workspace_members` for the current user
- [x] **0 rows** → bootstrap (below), return the new id
- [x] **1 row** → return it
- [x] **>1 rows** → if `?workspaceId=` present and the user is a member, use it;
      otherwise return 400 with `{ error, workspaces: [{id, name}] }`
- [x] `bootstrapWorkspace(supabase, user)` — insert `users`, `workspaces`
      (`owner_id` = user), `workspace_members` (`role: 'owner'`), in that order
- [x] Bootstrap is idempotent: a concurrent duplicate request must not create two
      workspaces — rely on the `uq_workspace_members` unique index and treat a
      conflict as "already bootstrapped, re-read"
- [x] Unit tests for all four branches

## Notes

The `users` row must be inserted before `workspaces`, because `workspaces.owner_id`
is a plain text column but `workspace_members.user_id` is compared against
`auth.uid()::text` in every policy — an orphaned membership is invisible to its
own owner.

`users.id` must equal the Supabase Auth `user.id`. The RLS helpers compare
`m.user_id = (select auth.uid())::text`; any other id makes the user a member of
nothing.

## Verification

- [x] `pnpm --filter web test` passes
- [x] Signing in as a brand-new user creates exactly one `workspaces`, one
      `workspace_members`, and one `users` row — verified by querying staging
- [x] Running the same bootstrap twice concurrently still yields one workspace
- [x] A user in two workspaces without `?workspaceId=` gets 400 listing both

## Result

**Status reconciled 2026-08-25.** This row read `queued` until then, while [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and this phase's row in [`../README.md`](../README.md) had both said done since 2026-08-10 — the old "tick both places" protocol failing under fully serial work, which is what `AGENTS.md` §2.9 was adopted to stop. The phase record is the authority for a closed phase: M2 shipped and was verified on staging on 2026-08-10, browser pass included. Any `[ ]` left in the checklists above was **never recorded**, not disproved; it is not re-adjudicated here.
