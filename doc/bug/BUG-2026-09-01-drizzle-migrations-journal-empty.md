# BUG-2026-09-01-drizzle-migrations-journal-empty

**Status:** 🔴 open
**Reported by:** agent — applying a new migration (`0011_gorgeous_thing.sql`, adding `runtimes.monthly_cost_budget_usd`) for the Machines feature build
**Reported:** 2026-09-01

## Symptom

`npx drizzle-kit migrate --config=packages/shared/drizzle.config.ts`, run
against the real dev-tier Supabase project (`DATABASE_URL` from
`apps/web/.env.local`), fails with exit code 1. The CLI's spinner UI swallows
the actual error — stdout shows only two benign NOTICEs (`schema "drizzle"
already exists`, `relation "__drizzle_migrations" already exists`) and then
exits non-zero with no further message, in both a plain Bash invocation and a
PowerShell one with clean env-var loading (ruling out a shell-quoting
artifact).

## Reproduction

1. Load `DATABASE_URL` from `apps/web/.env.local` into the environment.
2. Run `npx drizzle-kit migrate --config=packages/shared/drizzle.config.ts`.
3. Observe: the two NOTICEs above, then exit code 1, no further diagnostic.

Reproduced twice, identically, in two different shells.

## Investigation

Queried the database directly:

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;
```

**Zero rows.** The `drizzle` schema and `__drizzle_migrations` table exist
(hence the NOTICEs — they were created by an earlier attempt, most likely
this same failing command run before), but nothing is recorded as applied.

Meanwhile `packages/shared/drizzle/meta/_journal.json` lists 12 local
migration entries (`0000_special_romulus` through `0011_gorgeous_thing`, the
last being the one this session generated), and the live database's actual
`public` schema already has all ~41 tables — confirmed by querying
`runtimes` directly and by every existing Server Action in `apps/web` working
against tables like `runs`, `agent_machine_restrictions`, etc.

This matches `packages/shared/drizzle/policies/README.md`'s own documented
history exactly: "009–011 were applied through `scripts/apply-sql.mjs`,
which records nothing, so `list_migrations` shows fewer entries than this
list has files" and "Two live tables have no creating migration anywhere in
this history... found while setting up the production project from an empty
database." The schema itself was bootstrapped and evolved through some
combination of `scripts/apply-sql.mjs` and manual application, never through
`drizzle-kit migrate`, so the journal table was never populated. With it
empty, `drizzle-kit migrate` believes NOTHING has been applied and tries to
replay migration `0000_special_romulus` (`CREATE TABLE "workspaces" (...)`,
etc.) from scratch — against tables that already exist. That first
`CREATE TABLE` is almost certainly the swallowed error.

**Not investigated further:** the exact swallowed error text (would need
`drizzle-kit migrate --verbose` or a non-TTY-safe log flag, not attempted
tonight) and whether this reproduces identically against the `staging`
Supabase project (only the dev-tier project was touched).

## Impact

**`drizzle-kit migrate` cannot currently be used against this dev database
by anyone, for any migration** — not specific to tonight's column. Every
future schema change either needs the journal reconciled first, or has to
fall back to `scripts/apply-sql.mjs` / a direct hand-run `ALTER`/`CREATE`,
same as this session did for `0011`. That fallback works but leaves the
journal further out of sync every time, compounding the problem rather than
fixing it — the gap doesn't close on its own.

No data-loss or security exposure: `drizzle-kit migrate` fails closed (never
applies a broken statement), and the workaround (`scripts/apply-sql.mjs` /
direct SQL) is already this repo's own documented, accepted pattern for
exactly this situation.

## Resolution

Not fixed. Reconciling `__drizzle_migrations` (marking `0000`–`0010` as
already-applied, matching what the live schema actually has, verified table
by table rather than assumed) is real, careful work that deserves its own
reviewed task — not something to do as a side effect of one column addition
at 1am unsupervised. `0011_gorgeous_thing.sql`'s single column was applied
directly instead (`ALTER TABLE "runtimes" ADD COLUMN IF NOT EXISTS
"monthly_cost_budget_usd" double precision`), verified present via
`information_schema.columns` — see the Machines feature-build commit.

## Related finding, same root cause, fixed — `017_access_model.sql` was never applied here either

While live-verifying the Machines feature build (agent-browser, a real
signed-in session, real RLS enforcement — not mocked), adding an agent
restriction from the new UI failed with `"Forbidden by Row Level Security"`
even for the workspace's own owner. Queried `pg_policies` directly:
`agent_machine_restrictions` and `machine_shared_locations` both had RLS
**enabled with zero policies** — the `private.current_admin_workspace_ids()`
function existed (some other file must have created it) but `017_access_model.sql`
itself, which defines both tables' four policies each, had evidently never
been run against this specific dev database. Same failure class as this
bug's main finding: the applied-state history for this database has gaps
`drizzle-kit migrate`'s empty journal can't reveal because it only tracks
numbered migrations, not the hand-run `policies/*.sql` files.

**Fixed**, not just worked around: `node scripts/apply-sql.mjs
packages/shared/drizzle/policies/017_access_model.sql` — the repo's own
existing, idempotent tool for exactly this. Verified before (0 policies on
both tables) and after (4 policies each, matching the file). Re-ran the
add-restriction flow live afterward and it succeeded.

**Open question this raises:** if `017` was missing, other policy files in
that numbered sequence might be too — this was found by hitting the one
table this session's feature happened to touch, not by an audit of all 32
files in `policies/`. Worth a deliberate sweep (compare `pg_policies` counts
against what each file defines) rather than assuming this was the only gap.
