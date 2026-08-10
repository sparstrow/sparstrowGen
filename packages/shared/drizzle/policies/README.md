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
```

003–006 all exist for the same underlying reason: **PostgREST cannot span
statements.** Any invariant that needs more than one statement to hold has to
live in the database, or it will be violated the first time a request fails
halfway or two requests race. 004 and 006 are that lesson applied twice.

### Accepted advisor findings

`get_advisors(type: "security")` reports two items that are intentional:

- **`bootstrap_workspace` is a SECURITY DEFINER function callable by
  `authenticated`.** That is what it is for. It must write the very
  `workspace_members` row that every RLS policy keys on, so it cannot run as
  the caller. It only ever acts on `auth.uid()`, so a caller cannot bootstrap
  on anyone else's behalf.
- **Leaked password protection is disabled.** A dashboard setting with no SQL
  equivalent — Authentication → Policies. Worth enabling now that magic-link
  auth is gone and passwords are the primary path.
