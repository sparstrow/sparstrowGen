# BUG-2026-08-18-orphaned-account-rows-on-staging

**Status:** 🔴 open
**Reported by:** agent — found while dry-running `T-M9-01`'s cleanup against staging
**Reported:** 2026-08-18

## Symptom

Staging holds **eight orphaned account trees**: `public.users` rows, the
workspaces they own, and the memberships joining them, for accounts that no
longer exist in `auth.users`.

Read from `sparstrowgen-staging` (`pnymngoqseltgigcfevq`) on 2026-08-18:

| | count |
|---|---|
| `auth.users` | **1** |
| `public.users` | **9** |
| `public.users` with no matching `auth.users` row | **8** |
| `auth.users` with no profile row | 0 |
| `public.workspaces` | 8 |
| `public.workspace_members` | 8 |

The one live account is `domains`. The eight orphans are verification debris
from M2–M7 passes — `test.user`, `dev`, `sri`, `uipass-1786393240025`,
`uipass-1786449182221`, `m4rpc-probe`, `sriharicoder`, `agent` — created between
2026-08-10 and 2026-08-16. Seven of them still own a workspace and hold a
membership in it.

**Nothing can ever reach these rows again.** Every RLS policy in
`001_rls.sql` keys on `auth.uid()` or on `private.current_workspace_ids()`,
which resolves through `workspace_members` for the *calling* user. With no
auth user to be, there is no session that can select, update or delete any of
it. They are permanent until someone runs SQL as `postgres`.

## Reproduction

Not a UI flow. Reproduce the *state* with a read-only query:

```sql
select (select count(*) from auth.users)                                 as auth_users,
       (select count(*) from public.users)                               as public_users,
       (select count(*) from public.users u
          where not exists (select 1 from auth.users a where a.id::text = u.id))
                                                                         as orphans;
```

Reproduce the *cause* on any environment:

1. Sign up a throwaway account. It bootstraps a `public.users` row, a
   `workspaces` row and a `workspace_members` row (`004_bootstrap_rpc.sql`).
2. Delete it with `supabase.auth.admin.deleteUser(id)`, or from the dashboard's
   Authentication → Users list.
3. **Expected:** the account and everything it owns are gone.
   **Actual:** `auth.users` loses one row and the other three rows remain,
   silently and permanently.

## Investigation

**`delete_own_account` is not the cause, and is not broken.** Its live
definition was read off staging with `pg_get_functiondef`. It is thorough and
correct: it refuses when the account owns a workspace shared with others, then
deletes owned-and-unshared workspaces, orphaned owned workspaces,
`pairing_codes`, `workspace_members`, nulls out `assignee_user_id` / `user_id`
across seven tables, deletes the `public.users` row, and only then deletes from
`auth.users` — all in one transaction. An account deleted through the app
leaves nothing.

**There is no foreign key from `public.users.id` to `auth.users.id`**, and there
cannot easily be one: the columns are `text` and `uuid` respectively, and they
live in different schemas. So nothing in the database enforces the cascade —
`delete_own_account` *is* the cascade, and it only runs when it is called.

**So the orphans came from deleting the auth user directly**, bypassing it.
Either the dashboard or `auth.admin.deleteUser`. The agent verification runbook
([`runbooks/agent-browser-session.md:59-65`](../runbooks/agent-browser-session.md:59))
does carry a correct cleanup query that removes all three, so following the
runbook does not produce this. Something else did — most likely ad-hoc admin-API
cleanup in an M2–M7 verification pass, and the names support that.

**Ruled out:** an id-format mismatch. `auth_without_profile` is 0, so the join
predicate is sound; the rows genuinely have no counterpart.

## Impact

**Today: low, and confined to staging.** No user-facing surface reads these
rows. Nobody can see another account's data — quite the opposite, the rows are
invisible to everyone including the owner. The eight workspaces do not appear in
anyone's `getActiveWorkspaceId`, because that resolves through
`workspace_members` for the calling user.

**Why it still matters:**

- **It will grow, and the mechanism is the standard one.** Every verification
  pass that mints a throwaway account and cleans it up with the admin API adds
  another tree. `T-M9-06` and `T-M11-01` both plan to do exactly this.
- **It distorts anything that counts.** `T-M9-01`'s cleanup dry-run reported
  "1 user row affected" against a table of 9, which reads as a broken query
  until you know why. Any future capacity, usage or health figure read off these
  tables is wrong by 8.
- **It is unrecoverable through the product.** Not a leak, but the same
  structural failure `007_delete_own_account.sql` was written to prevent — its
  README entry calls a half-deleted account "the sharpest case, because it
  leaves rows that no RLS policy can ever reach again". That is precisely what
  is sitting on staging now.

**Not a security issue** — the rows are unreachable rather than exposed, and no
credential or token is involved. Filed here rather than in `security/` for that
reason. `daemon_tokens` was checked: no orphaned account holds one.

## Resolution

Open. Two halves, and the second matters more than the first:

1. **Clean up the eight trees** — one SQL statement as `postgres`, deleting
   `workspaces` (which cascades to `workspace_members`), then `public.users`,
   for every `public.users.id` with no `auth.users` counterpart. Cheap, and
   worth doing in the same session as M9's migration since that already needs a
   privileged connection.
2. **Stop producing them.** `auth.admin.deleteUser` alone must never be the way
   a throwaway account is removed. The runbook's query is correct; what is
   missing is a sentence saying *use it, and do not reach for the admin API or
   the dashboard instead* — added in the same change as this file.

A database-level guarantee (an `after delete` trigger on `auth.users`) is
**not** proposed. This repo has had one incident from a trigger on `auth.users`
that nobody remembered
([`SEC-2026-08-16`](../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md)),
and a second one deleting rows is a worse version of the same risk.
