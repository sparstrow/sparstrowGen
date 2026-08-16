# Post-migration SQL

Drizzle generates table DDL. It does **not** generate Row Level Security
policies or Realtime publication membership, so those live here.

These files sit in `policies/` rather than alongside the numbered migrations on
purpose. A hand-written `0001_*.sql` next to drizzle's `0000_*.sql` looks like
part of the migration sequence but is invisible to `meta/_journal.json` — that
ambiguity is what left the previous `0001_realtime_and_pgvector.sql` silently
unapplied while appearing to be a real migration.

## Apply order

```bash
# 1. Tables + FK indexes
npx drizzle-kit migrate --config=packages/shared/drizzle.config.ts

# 2. Security boundary  (idempotent — safe to re-run)
psql "$DATABASE_URL" -f packages/shared/drizzle/policies/001_rls.sql

# 3. Realtime publication  (idempotent — safe to re-run)
psql "$DATABASE_URL" -f packages/shared/drizzle/policies/002_realtime.sql
```

For a brand-new database, `../apply-to-supabase.sql` bundles all three into one
paste-able file.

## Policy shape: why set-returning helpers

Policies are written as:

```sql
using (workspace_id in (select private.current_workspace_ids()))
```

not as:

```sql
using (public.is_workspace_member(workspace_id))   -- DON'T
```

The second form passes the row's own column as an argument, which makes it a
per-row function call Postgres cannot hoist. The first takes no arguments, so
it is constant per query: Postgres evaluates it once as an InitPlan and then
does a hashed membership test per row. On `run_events` — the highest-row-count
table in the schema — that is the difference between one lookup and one lookup
per event.

Same reason `auth.uid()` is always wrapped as `(select auth.uid())`.

## Why the helpers live in `private`

PostgREST only exposes the `public` schema, so a `SECURITY DEFINER` helper in
`private` cannot be reached as a REST RPC endpoint regardless of its EXECUTE
grants. `authenticated` still needs `USAGE` on the schema for policy expressions
to resolve the name.

`SECURITY DEFINER` is required for correctness too, not just speed: the helpers
read `workspace_members`, which itself has RLS enabled. An INVOKER function
would re-enter that policy and recurse.

## Foreign-key indexes

Postgres does not index FK columns automatically. Migration `0001` adds the 25
that were missing — mostly `workspace_id`, which every policy filters on. Re-run
this to check for regressions after adding tables:

```sql
select conrelid::regclass as tbl, a.attname as col
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f' and connamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and a.attnum = i.indkey[0]
  );
```

Both policy files are rerunnable: every `create policy` is preceded by
`drop policy if exists`, and publication membership is checked before `ADD TABLE`.
Both also `raise exception` if a target table is missing, so a schema drift
fails loudly at apply time instead of silently leaving a table without RLS.

## Why RLS matters more here than in a typical app

Dispatch is cloud-canonical: a row in `runtime_commands` (or a `tasks` row with
a `target_runtime_id`) causes a process to spawn on someone's physical machine.
A workspace isolation bug is therefore a remote-code-execution bug, not a data
leak. Treat `001_rls.sql` as security-critical code and review it as such.

## Daemons are not covered by RLS

Daemons authenticate with a token, not a Supabase session, so `auth.uid()` is
null for them and every policy here denies access. They reach the database only
through `SECURITY DEFINER` RPCs that verify the token hash themselves — added in
M3 (pairing/registration) and M4 (claim/ack). This is deliberate: the daemon's
surface should be a handful of audited functions, not broad table access.

## Removed from the previous version

- `system_health` was listed in the Realtime publication but exists in no
  schema, which made the entire `ALTER PUBLICATION` statement fail.
- The `idx_memory_notes_embedding_hnsw` index and the
  `match_memory_notes(vector(1536), ...)` RPC were both built on
  `memory_notes.embedding`. That column is gone: every daemon embeds locally
  with the bundled 384-dim model, so vectors never cross the wire and semantic
  search stays a sub-15ms local read. See the memory section of the schema for
  the full rationale.

## Apply order (updated 2026-08-10)

```
0000_special_romulus.sql        36 tables
0001_flat_justin_hammer.sql     25 FK indexes
policies/001_rls.sql            RLS + private.* helpers
policies/002_realtime.sql       realtime publication (11 tables)
policies/003_bootstrap_fix.sql  break the first-workspace RLS deadlock
policies/004_bootstrap_rpc.sql  atomic, race-safe bootstrap_workspace()
policies/005_harden_legacy_functions.sql
policies/006_agent_skill_assignments_rpc.sql
policies/007_delete_own_account.sql
policies/008_redeem_pairing_code.sql   M3 — pairing code → runtime + token
policies/009_command_spine.sql         M4 — start/cancel a run, claim/ack commands
policies/010_transcript_broadcast.sql  M5 — who may subscribe to a run's transcript
policies/011_drop_auto_confirm.sql     drop the auth.users auto-confirm trigger
```

**010 is the first policy on a table this project does not own.**
`realtime.messages` belongs to `supabase_realtime_admin`, and `postgres` is not
a member of it. `create policy` works anyway; `alter table … enable row level
security` does not, which is why 010 *asserts* RLS is on rather than turning it
on. Supabase enables it by default — if that assertion ever fires, every private
channel is world-readable and the policy is decoration, so it raises rather than
proceeding.

It also has no `insert` policy, deliberately. Only the service role sends on
these topics, and a client able to write to a transcript channel could forge
agent output that the browser merges indistinguishably with real events. An
INSERT policy on `realtime.messages` is a finding, not a feature.

**No `psql` on Windows.** The commands at the top of this file assume it is
installed; on the factory box it is not. `scripts/apply-sql.mjs` applies any one
of these files over `DATABASE_URL` using the `postgres` package that is already
a dependency:

```bash
node scripts/apply-sql.mjs packages/shared/drizzle/policies/009_command_spine.sql
```

**009 splits along who may call it**, and that line matters more than anything
else in the file. `start_run` and `cancel_run` run with the *user's* session and
check membership internally, so they are granted to `authenticated` exactly like
004 and 007. `claim_runtime_commands` and `ack_runtime_command` take a **runtime
id as an argument** and therefore trust their caller completely — the thing
establishing that the caller *is* that machine is the bearer-token check in
`/api/daemon/*`, which happens outside the database. Granted to `authenticated`,
either one would let any signed-in user drain or close another machine's queue
by naming its id. Verified after applying, the same way 008 is:

```sql
select proname,
       has_function_privilege('anon', oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', oid, 'EXECUTE') as auth
from pg_proc
where proname in ('claim_runtime_commands', 'ack_runtime_command');  -- must be f, f
```

`bash`-free verification for the whole file lives in
`verify-command-spine.mjs`, which stands up a throwaway container exactly as
`verify-rls.sh` does — never your Supabase project — and proves the parts that
only misbehave under concurrency: that two claimers get disjoint rows, that an
expired lease is reclaimed exactly once, and that a poison command stops being
dispatched.

003–009 all exist for the same underlying reason: **PostgREST cannot span
statements.** Any invariant that needs more than one statement to hold has to
live in the database, or it will be violated the first time a request fails
halfway or two requests race. 004, 006, 007 and 008 are that lesson applied
four times — 007 is the sharpest case, because a half-deleted account leaves
rows that no RLS policy can ever reach again, and 008 is the one where the
failure is a *security* failure: a pairing code redeemed twice is a credential
that paired a machine nobody authorised.

**008 is the first function here that `authenticated` must NOT hold.** The
others act on `auth.uid()` and are safe to expose as RPCs. This one's authority
comes from the pairing code it is handed, so anyone able to call it could mint
a daemon token; and reachable from `anon` it would be brute-forceable at
PostgREST's rate rather than the app's. It is `service_role` only, called
exclusively by `/api/daemon/pair`. Verified after applying:

```sql
select has_function_privilege('anon', oid, 'EXECUTE'),
       has_function_privilege('authenticated', oid, 'EXECUTE')
from pg_proc where proname = 'redeem_pairing_code';   -- must be f, f
```

It also uses `select … for update` rather than the advisory lock 004 and 007
take. Those serialise on a user id where the contended thing is the *absence*
of rows — there is nothing to lock. Here the contended thing is one existing
row with a primary key, so a row lock is the precise tool. The code row is
fetched **without** filtering on `consumed_at`, deliberately: filtering would
make the loser of a race see zero rows and report "unknown code", sending
someone hunting for a typo in a code that was simply already used.

### Accepted advisor findings

`get_advisors(type: "security")` reports these, and they are intentional:

- **`bootstrap_workspace` is a SECURITY DEFINER function callable by
  `authenticated`.** That is what it is for. It must write the very
  `workspace_members` row that every RLS policy keys on, so it cannot run as
  the caller. It only ever acts on `auth.uid()`, so a caller cannot bootstrap
  on anyone else's behalf.
- **`delete_own_account` is a SECURITY DEFINER function callable by
  `authenticated`.** Same shape, same reasoning: it has to reach `auth.users`,
  which no invoker-rights function can. It takes **no arguments** and resolves
  its target from `auth.uid()`, so there is no parameter to point at another
  account. A service-role variant taking a user id would have put "delete any
  user" one missing check away from being reachable over HTTP.

`redeem_pairing_code` (008) is **not** on this list and should never appear on
it. The advisor only flags `SECURITY DEFINER` functions reachable by
`authenticated`, and that one is service-role only — if it ever shows up here,
a grant has been widened and the pairing flow is exposed.

### Still open

- **Leaked password protection is disabled, and cannot be enabled on this
  plan.** The advisor will keep reporting it; treat it as a known gap rather
  than an action item. It is a **Supabase Pro** feature (confirmed on the
  dashboard, 2026-08-10) with no SQL equivalent — there is no way to turn it on
  from a migration.

  Verified empirically rather than read off the advisor: `POST /auth/v1/signup`
  with the password `password123` succeeded and returned a session.

  The residual risk is that a user can choose a password already published in a
  breach corpus. Re-check with that same signup after any plan change.

  Partly mitigated since 2026-08-10: **magic-link sign-in is back**, and an
  account that signs in by emailed link has no password to be breached at all.
  It is opt-in per user, so this narrows the exposure rather than closing it.
- ~~**`auto_confirm_user()` marks every new signup's email as confirmed**~~ —
  **closed 2026-08-16 by [`011_drop_auto_confirm.sql`](011_drop_auto_confirm.sql).**
  The trigger and function are dropped; verified absent from `pg_trigger` /
  `pg_proc` after applying.

  Worth reading `011`'s header before assuming this was routine. The trigger
  **silently overrode the dashboard's "Confirm email" setting**: both the
  dashboard and GoTrue's `/auth/v1/settings` reported confirmation as enforced
  (`mailer_autoconfirm: false`) while the database did the opposite, so toggling
  the setting changed nothing and the contradiction was invisible to every check
  an operator would normally run. That characteristic — a database object
  overriding a platform setting, with both sources of truth still reporting the
  setting's value — is the part worth remembering, not the trigger itself.
  Full account: [`doc/security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md`](../../../../doc/security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md).

  **Signup now depends on email delivery**, which is still unproven (`G-11`).
