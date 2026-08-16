# T-M9-01 — Schema, and a bootstrap that invents nothing

| | |
|---|---|
| **Tag** | `[S]` — every other task in M9 and M10 reads columns this creates, and the completion rule depends on the bootstrap change |
| **Serves** | **foundational** — unblocks everything in M9 and M10 |
| **Depends on** | — |
| **Blocks** | T-M9-02 … T-M9-06, and all of M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `supabase` and `supabase-postgres-best-practices` skills loaded **before**
      writing SQL (AGENTS.md §3.12)
- [ ] Three columns added to `packages/shared/src/db/schema.ts`
- [ ] `drizzle-kit generate` run; the generated migration reviewed by eye before
      it is applied — it is three `ALTER TABLE ADD COLUMN`s and nothing else
- [ ] New policy file `packages/shared/drizzle/policies/012_no_invented_names.sql`
      containing the replaced `bootstrap_workspace` **and** the two cleanup
      statements, in that order
- [ ] The function keeps its existing `SECURITY DEFINER`, its `search_path`
      pinning, its advisory lock, and its grant — copy the current definition
      and change only the two `coalesce`/`values` expressions
- [ ] Applied to staging; `list_migrations` confirms it landed
- [ ] RLS unaffected: the three new columns inherit their tables' existing
      policies. **Confirm** rather than assume — `get_advisors` for security
      after applying
- [ ] `pnpm typecheck` green; any code that reads `users.name` or
      `workspaces.name` for display gains an empty fallback (grep for both;
      `workspace-switcher.tsx` is the known one, `T-M10-04` owns it)
- [ ] `pnpm test` green

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

- [ ] Sign up a **throwaway account** on staging. Read the rows directly:
      `users.name = ''` and `workspaces.name = ''`, `workspaces.slug` matches
      `^personal-[0-9a-f]{8}$`, `users.email` correct. **This is SC-008** and it
      is checked against the database, not the screen
- [ ] Every `/api/v1` endpoint still resolves for that account — bootstrap did
      not break
- [ ] The owner's pre-existing account: `users.name` and `workspaces.name` both
      now `''`, and nothing else about the account changed
- [ ] `get_advisors` reports no new security or performance findings
- [ ] `pnpm -r typecheck` and `pnpm -r test` green

## On completion

- [ ] Tick 11.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Record in the Result **exactly how many rows the cleanup touched**

## Result

<!-- The generated migration name, the policy file, the throwaway account's
     actual column values, and the cleanup's row counts. -->
