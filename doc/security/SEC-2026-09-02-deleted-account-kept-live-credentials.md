# SEC-2026-09-02-deleted-account-kept-live-credentials

**Status:** 🟢 resolved — fixed and verified the same day, before reaching any environment other than staging
**Severity:** high (as designed); never exploitable in practice — see Impact
**Reported by:** agent — found while cleaning up after the end-to-end verification of
[`2026-09-02-computers-that-are-just-there`](../plans/2026-09-02-computers-that-are-just-there.md)
**Reported:** 2026-09-02

## What's exposed / what's possible

`delete_own_account()` (policies/032) never swept the machine credential tables.
It deleted workspaces, memberships, pairing attempts, the profile row and the
auth row — but nothing keyed on `user_id` outside those.

Under the **workspace-scoped** credential this was untidy and harmless: a
`daemon_tokens` row carried a `workspace_id` with `ON DELETE CASCADE`, so
deleting the account's workspaces took the tokens with them.

Under the **person-scoped** credential shipped by the plan above, it is a
security hole. `access_tokens` carries no workspace at all, and
`authenticateMachine` checks only `revoked_at` — **never whether the user still
exists**. So:

> Delete your account. Every computer you ever connected keeps authenticating,
> indefinitely, as an identity that no longer exists — and there is no way left
> to revoke them, because the tokens page resolves through a session that is
> gone.

`machines` had the same gap, and with it every `runtimes` row hanging off it.

The root cause is the one
[`BUG-2026-08-18-orphaned-account-rows-on-staging`](../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md)
already records: there is no foreign key from anything keyed on `user_id` to
`auth.users`, because the columns are `text` and `uuid` in different schemas.
Nothing cascades; every such table must be swept by hand, and two new ones were
added without being added to the sweep.

## Who can trigger it

The account holder, by deleting their own account — the ordinary, documented
path, with no attacker involved. The resulting live credentials are then usable
by anyone holding the token file on any of those machines.

## Evidence

Read directly, then reproduced:

- `packages/shared/drizzle/policies/032_delete_own_account_pairing_attempts.sql`
  — the live version before this fix. It sweeps `pairing_attempts`,
  `workspace_members`, `users` and `auth.users`, and no credential table.
- `apps/web/src/lib/daemon/auth.ts` — `authenticateMachine` selects
  `id, user_id, machine_id, revoked_at` and rejects only on `revoked_at`. There
  is no existence check on the user, by design: adding one would put a join on
  the hot path of every heartbeat.
- Reproduced in a rolled-back transaction on staging
  (`before delete: {tokens:1, machines:1, runtimes:1}`), against the *unfixed*
  function, with all three surviving.

**A second, louder defect was found at the same time.** 032's function ends with
`delete from public.pairing_attempts …`, and migration 0012 dropped that table.
From the moment 0012 applied to staging, **every** account deletion raised
`relation "public.pairing_attempts" does not exist` and rolled back. That made
account deletion impossible rather than incomplete — self-announcing, and fixed
by the same file.

## Impact

**Never exploitable.** The window opened when migration 0012 applied to staging
and closed when 034 applied roughly twenty minutes later, and for that entire
window the *other* defect made account deletion throw — so no account could be
deleted, so no credential could be orphaned. Staging held zero access tokens
throughout. Nothing reached `development`, `staging` as a deployed app, or
production, because the branch is unmerged.

Had it shipped: high. Permanent, unrevocable access to every machine a departed
user ever connected, with no surface anywhere that would show it.

## Resolution

`packages/shared/drizzle/policies/034_delete_own_account_access_tokens.sql`
replaces the function to sweep `connect_attempts`, `access_tokens` and
`machines` (which cascades to `runtimes`), and drops the reference to the
dropped table.

Ordering is load-bearing and commented in the file: **tokens before machines**,
because `access_tokens.machine_id` is `ON DELETE SET NULL` — deleting machines
first would leave the token rows behind with a null `machine_id` rather than
removing them, which is the same bug wearing a different shape.

Applied to staging 2026-09-02 and verified by creating a full account tree
(user, workspace, membership, machine, runtime, live token), calling the real
function as that user, and confirming all six row types are gone:

```
before delete: {"tokens":1,"machines":1,"runtimes":1}
after delete:  {"tokens":0,"machines":0,"runtimes":0,"workspaces":0,"profile":0,"authUser":0}
PASS — nothing of that account survives
```

**The general lesson, which is the part worth keeping:** every table keyed on
`user_id` must be added to `delete_own_account()` when it is created, because
the database will not do it for you and nothing fails loudly when you forget.
`machines` and `access_tokens` were the third and fourth tables to hit this.
A test that asserts the sweep is complete — rather than a comment asking people
to remember — is the real fix, and does not exist yet.
