# T-M9-01 — Schema, and a bootstrap that invents nothing

| | |
|---|---|
| **Tag** | `[S]` — every other task in M9 and M10 reads columns this creates, and the completion rule depends on the bootstrap change |
| **Serves** | **foundational** — unblocks everything in M9 and M10 |
| **Depends on** | — |
| **Blocks** | T-M9-02 … T-M9-06, and all of M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ **done — applied and verified on staging 2026-08-18** |

## The requirement this satisfies

**FR-019**: nothing may derive a person's name or a workspace's name from an
email address, or from anything else the owner did not supply. A new account
starts with neither name set.

Spec decision 6. This is the task that makes the rest of the phase honest — the
completion rule in `setupSteps()` is a plain emptiness check *because* this
task removes the thing that was filling those fields in.

> ⚠️ **Load the `supabase` and `supabase-postgres-best-practices` skills before
> writing any SQL here** — AGENTS.md §3.12, not optional. This task changes a
> `SECURITY DEFINER` function that runs on every user's first request, adds
> columns to two RLS-protected tables, and runs a one-time data mutation.

## Objective

Three things, in one migration and one policy file:

1. Add `users.bio`, `workspaces.logo_url`, `workspaces.context`.
2. Rewrite `bootstrap_workspace` so it stops inventing a person's name and a
   workspace's name.
3. Clear, once, the names it has already invented.

## Decisions already made

### Columns

```ts
// packages/shared/src/db/schema.ts
users:      bio:      text("bio").notNull().default(""),
workspaces: logoUrl:  text("logo_url"),
workspaces: context:  text("context").notNull().default(""),
```

`bio` and `context` mirror `workspaces.description`, which is already
`notNull().default("")` — same shape, same reasoning, no new pattern.
`logo_url` mirrors `users.avatar_url`, which is nullable. Matching the
neighbouring column beats being internally consistent with the other new one.

**Length is capped in the handler, not the column.** `text` with a check
constraint would fail an over-long write with a SQLSTATE the API layer would
have to translate into a readable message anyway. See `T-M9-02`/`T-M9-03`.

### `bootstrap_workspace` stops inventing names

Two edits to
[`004_bootstrap_rpc.sql`](../../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql),
shipped as a **new** numbered policy file that replaces the function — not an
edit in place, so the applied history stays readable:

```sql
-- was: coalesce(full_name, name, split_part(email,'@',1), 'User')
-- now: whatever the PROVIDER actually gave us, and nothing else.
select u.email,
       coalesce(
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name',
         ''                                   -- <- no email fallback, no 'User'
       )
  into v_email, v_name
from auth.users u
where u.id = v_user_id::uuid;

-- was: values (v_workspace_id, 'Personal Workspace', 'personal-' || …, v_user_id)
-- now:
values (v_workspace_id, '', 'personal-' || pg_catalog."left"(v_workspace_id, 8), v_user_id);
```

**The slug keeps its generated value.** It is `notNull().unique()` and is a
machine identifier, not a name — a workspace must have one from the moment it
exists. It becomes a name-derived slug on the first real naming and freezes
there (plan decision 8).

**A GitHub or Google `full_name` is still honoured.** Those providers ask the
person for their name, so it *was* supplied — just not by us. Keeping it means
someone signing in that way arrives with their profile step already legitimately
done. (Both providers are parked as [`D-8`](../../Deferred.md), so this is
future-proofing rather than a live path.)

### The one-time cleanup, and its exact scope

Accounts created before this migration already carry invented names. Scenario
11 says they must read honestly, so they get cleared — **narrowly**:

```sql
-- Only names that are EXACTLY the email local part. A person genuinely called
-- by that string keeps it; this clears what bootstrap wrote, not what anyone
-- chose.
update public.users u
   set name = ''
  from auth.users a
 where a.id::text = u.id
   and u.name = pg_catalog.split_part(u.email, '@', 1)
   and coalesce(a.raw_user_meta_data ->> 'full_name', '') = ''
   and coalesce(a.raw_user_meta_data ->> 'name', '') = '';

-- Only the literal bootstrap name, and only where the slug is still the
-- bootstrap-generated one -- i.e. the workspace has demonstrably never been named.
update public.workspaces
   set name = ''
 where name = 'Personal Workspace'
   and slug ~ '^personal-[0-9a-f]{8}$';
```

Both conditions on the workspace update matter. Someone who *typed*
"Personal Workspace" and thereby set a real slug keeps it.

**This is a data mutation on real rows and it is not reversible by re-running
anything.** It affects the owner's own account. It is small — one name to
retype — and it is what makes the guide tell the truth about a pre-existing
account. Say what it did in the Result.

## Checklist

- [x] `supabase` and `supabase-postgres-best-practices` skills loaded **before**
      writing SQL (AGENTS.md §3.12)
- [x] Three columns added to `packages/shared/src/db/schema.ts`
- [x] `drizzle-kit generate` run; the generated migration reviewed by eye before
      it is applied — it is three `ALTER TABLE ADD COLUMN`s and nothing else
- [x] New policy file `packages/shared/drizzle/policies/012_no_invented_names.sql`
      containing the replaced `bootstrap_workspace` **and** the two cleanup
      statements, in that order
- [x] The function keeps its existing `SECURITY DEFINER`, its `search_path`
      pinning, its advisory lock, and its grant — copy the current definition
      and change only the two `coalesce`/`values` expressions
- [x] Applied to staging; `list_migrations` confirms it landed
- [x] RLS unaffected: confirmed with `get_advisors(security)` after applying —
      no new findings, and the five it does report are all pre-existing and
      already accepted
- [x] `pnpm typecheck` green; any code that reads `users.name` or
      `workspaces.name` for display gains an empty fallback (grep for both;
      `workspace-switcher.tsx` is the known one, `T-M10-04` owns it)
- [x] `pnpm test` green

## Traps

**`users.name` and `workspaces.name` are `notNull()` with no default.** Writing
`''` is fine; writing `NULL` fails. Plan decision 6 chose `''` deliberately so
no consumer's type changes — do not "tidy" this into a nullable column.

**Do not edit `004_bootstrap_rpc.sql` in place.** The policies directory is an
applied history; its README explains why a hand-numbered file that looks like
part of the sequence but is not caused a real incident. Add `012_`.

**`bootstrap_workspace` runs on every user's first authenticated request** via
`getActiveWorkspaceId`. A syntax error or a dropped grant here 500s every
endpoint for every new account — which is exactly what M2's defect 1 was. Test
it by signing up a throwaway account, not by reading it.

**The cleanup runs once and cannot be undone by re-running the file.** It is
written to be idempotent (running it twice changes nothing further), but it
does not restore what it cleared. Read both statements before executing.

**`auth.users.id` is a `uuid` and `public.users.id` is `text`.** The join needs
the cast (`a.id::text = u.id`), as the existing function already does. Without
it the update silently matches nothing and the cleanup appears to succeed.

## Verification

- [x] Sign up a **throwaway account** on staging. Read the rows directly:
      `users.name = ''` and `workspaces.name = ''`, `workspaces.slug` matches
      `^personal-[0-9a-f]{8}$`, `users.email` correct. **This is SC-008** and it
      is checked against the database, not the screen
- [~] Every `/api/v1` endpoint still resolves for that account — bootstrap did
      not break — **not run**: proving this needs an HTTP session against a
      running app, not SQL. `bootstrap_workspace()` itself was invoked directly
      and returned a workspace id, which is the part that 500s every endpoint
      when it is broken. Remaining item in `T-M9-06`.
- [x] The owner's pre-existing account: `users.name` and `workspaces.name` both
      now `''`, and nothing else about the account changed
- [x] `get_advisors` reports no new security or performance findings
- [x] `pnpm -r typecheck` and `pnpm -r test` green

## On completion

- [x] Tick 11.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Record in the Result **exactly how many rows the cleanup touched**

## Result

**Applied to `sparstrowgen-staging` (`pnymngoqseltgigcfevq`) on 2026-08-18 and
verified against the database.** [`G-20`](../../KnownGaps.md) is closed and
deleted.

### Migrations landed

| Migration | Contents |
|---|---|
| `setup_identity_fields` | the three `ADD COLUMN`s from `0003_setup_identity_fields.sql` |
| `no_invented_names` | the replaced `bootstrap_workspace` from `012` |

Split from the file's own layout deliberately: the function went through
`apply_migration` (DDL, so it gets a history entry) and the two cleanup
`UPDATE`s through `execute_sql`, so their row counts could be captured with
`returning`. Same statements, same order.

### The cleanup's row counts — the number this section exists to record

| | rows changed |
|---|---|
| `public.users.name` cleared | **1** |
| `public.workspaces.name` cleared | **8** |

Both matched the dry-run taken beforehand, exactly. Afterwards: **0** workspaces
hold a non-empty name; 8 users still do, and **all eight are orphaned rows with
no `auth.users` counterpart** — see
[`BUG-2026-08-18-orphaned-account-rows-on-staging`](../../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md).
The single live account (`domains`) was cleared as intended. That is why the
user count reads 1-of-9 rather than 9-of-9; it is not a broken predicate.

### SC-008, proved from the database

A throwaway `auth.users` row was created with empty `raw_user_meta_data`,
`bootstrap_workspace()` was invoked under that user's JWT claims, and the
resulting rows were read directly:

| Column | Value |
|---|---|
| `users.name` | `''` |
| `users.bio` | `''` |
| `users.email` | `m9-sc008@sparstrow.test` |
| `workspaces.name` | `''` |
| `workspaces.context` | `''` |
| `workspaces.logo_url` | `NULL` |
| `workspaces.slug` | `personal-516a901f` — matches `^personal-[0-9a-f]{8}$` |
| `workspace_members.role` | `owner` |

**The provider path was proved too**, because it is the half that is easy to
break while making the first half pass: a second throwaway with
`raw_user_meta_data = {"full_name":"Sri Hari"}` bootstrapped to
`users.name = 'Sri Hari'` and `workspaces.name = ''`. A name someone actually
supplied survives; one nobody supplied does not appear.

Both test accounts deleted themselves completely — profile row, workspace,
membership and auth row — so this pass added **no** new orphans. Confirmed by
re-counting `@sparstrow.test` rows afterwards: the only two remaining are the
pre-existing `uipass-*` orphans from August 10–11.

### The function survived the replacement intact

Checked against `pg_proc` rather than by reading the file back:

- `prosecdef` = **true**, `proconfig` = `search_path=""`
- executable body (comments stripped) contains **no** `split_part(u.email` and
  **no** `'Personal Workspace'` — an earlier check said otherwise, but it was
  matching the new file's own comments, which quote the removed code
- advisory lock and the orphan-adoption branch present
- grants: `anon` = **false**, `authenticated` = **true**, unchanged

And the neighbouring invariants the policies README says must hold still do:
`redeem_pairing_code`, `claim_runtime_commands` and `ack_runtime_command` are
all `false, false`.

### One deviation from the task's stated SQL

None of substance. An earlier draft added `updated_at = now()` to both cleanup
`UPDATE`s and a redundant `u.name <> ''` guard; both were removed before
applying, to keep the statements exactly as decided and because the
verification step asserts *nothing else about the account changed*.

### One thing found that the phase docs do not name

`toSnapshot()` in
[`account-snapshot.ts:35`](../../../apps/web/src/lib/auth/account-snapshot.ts:35)
derives the shell's display name as
`user_metadata.full_name || user_metadata.name || email.split("@")[0] || "Account"`.

A **second** place a name is invented from an email address, in the session
store rather than the database — and now the *only* remaining one. Filed as
[`BUG-2026-08-18-shell-invents-name-from-email`](../../bug/BUG-2026-08-18-shell-invents-name-from-email.md),
owned by `T-M10-04`. It matters to `T-M9-03`: writing `full_name: ""` leaves an
empty string, which is falsy, so the chain falls through to the email and
clearing a name looks like a failed save.
