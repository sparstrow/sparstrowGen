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
0003_setup_identity_fields.sql  M9 — users.bio, workspaces.context, workspaces.logo_url
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
policies/012_no_invented_names.sql     M9 — bootstrap stops inventing names + one-time cleanup
policies/013_storage_images.sql        M9 — the public-images bucket and its write policies
policies/014_chat_turn_dispatch.sql    M12 — enqueue/retry/assign a chat turn
policies/015_chat_broadcast.sql        M12 — who may subscribe to a chat turn's live reply
policies/016_chat_turn_transcript.sql  M12 — recent messages travel in the chat.turn payload
policies/017_access_model.sql          M18 — machine_shared_locations, agent_machine_restrictions
policies/018_terminal_channels.sql     M16 — terminal/machine channel read + send policies
policies/019_daemon_realtime_identity.sql  DI — the daemon's own identity + its half of 018's channels
policies/020_bootstrap_refuses_daemon.sql  DI — bootstrap_workspace() refuses a daemon identity
```

**Applied to staging 2026-08-18** as migrations `setup_identity_fields`,
`no_invented_names`, `storage_images` and `storage_images_exact_depth`. Note the
history is partial by design: 009–011 were applied through `scripts/apply-sql.mjs`,
which records nothing, so `list_migrations` shows fewer entries than this list
has files.

**013 is the first file here that touches Supabase Storage**, and the first that
creates a **publicly readable** resource. Every object in `public-images` has a
guessable, permanent, unauthenticated URL — which is correct for an avatar and a
logo and wrong for everything else. Its header says so at length; read it before
putting any other kind of file in that bucket. Like 010, it *asserts* RLS is
enabled on `storage.objects` rather than enabling it: the table belongs to
`supabase_storage_admin`, and if the assertion ever fires the bucket is
world-writable and the policies are decoration.

**012 is the only file here that mutates existing rows.** Everything else in
this directory is idempotent structure — policies, grants, function bodies — and
can be replayed onto any database with the same result. 012 ends with two
`UPDATE`s that clear names `bootstrap_workspace` previously invented. Re-running
it changes nothing further, but it does **not** restore what it cleared, and it
touches the owner's own account. Read both statements before applying it to an
environment with real users in it.

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

**018 is the first file here with an INSERT policy on `realtime.messages`,
and the first gated on admin role rather than plain membership.** 010's and
015's "no insert policy, deliberately" reasoning is unchanged and still
applies to transcript and chat broadcasts — 018 grants a narrower thing on
two new topic families: an admin may send a keystroke (`input`) or a control
request (`request`) on a machine they may already open a shell on directly.
The event pin (`event = 'input'` / `event = 'request'`) is what keeps that
narrow: without it the same grant would let a client publish `output` or
`reply` and forge what another tab watching the same channel displays.

Confirmed directly against this project (not just the docs) before writing
the send policies: `realtime.messages` has a `text` column named `event`
holding the broadcast event name —

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'realtime' and table_name = 'messages';
```

Applied with `scripts/apply-sql.mjs` like every file since 009; re-run
immediately after to confirm it is a no-op, and `pg_policies` shows exactly
the expected six rows (010's, 015's, and 018's four). The deeper
role/cross-workspace/event-forgery negative assertions are intentionally
*not* done here as raw SQL impersonation — T-M16-06 §D does the live
two-session version instead, matching T-M5-06 §E and T-M12-06's precedent of
using a real second browser session rather than simulating one in SQL.

**019 is 018's mirror image, and the two are only correct together.** 018 is
the *browser's* half of the terminal channels (may send `request` and
`input`); 019 is the *machine's* (may send `reply` and `output`). Reading
either alone gives a misleading picture of who can do what on those topics.

019 is also the first file here to grant anything to an identity that is
deliberately **not a workspace member.** Each paired machine gets its own
Supabase Auth user, never inserted into `workspace_members`, so
`private.current_workspace_ids()` is empty for it and every policy 001/010/015
wrote denies it exactly as it denies an anonymous caller. Its only reachable
privilege is 019's four policies, on its own machine's two topics, resolved
through `private.current_daemon_scope()`. `doc/tasks/M3/README.md` decision 1
rejected a daemon auth user *that looks like a member* — that objection is
respected here, not overridden; see 019's own header for the full argument and
for why a Custom Access Token Hook was rejected in favour of the mapping table.

**Revocation is enforced inside `current_daemon_scope()`**, which requires a
live (non-revoked) `daemon_tokens` row. That is why nothing else has to clean
up when a pairing is revoked, and why the orphaned `auth.users` row a removed
machine leaves behind is inert rather than dangerous (`I-14`).

**020 replaces `bootstrap_workspace()` wholesale**, because Postgres cannot
patch a function body in place. It is 004's function verbatim plus one guard —
verify with a diff before applying, and if 004 has changed since, re-copy it
rather than editing around it. The guard exists because a daemon's token is a
real `authenticated` JWT: everything else denies it for lack of membership, and
`bootstrap_workspace()` is the one function that exists precisely to serve a
member-less caller.

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
- **`start_run` and `cancel_run` are SECURITY DEFINER functions callable by
  `authenticated`.** Added to this list 2026-08-18 — the advisor has always
  reported them, and they were simply never written down here. Same shape as the
  two above: both resolve the caller from `auth.uid()` and check workspace
  membership internally, which is exactly why 009 grants them to `authenticated`
  while granting `claim_runtime_commands` and `ack_runtime_command` to nobody.
- **`enqueue_chat_turn` and `retry_chat_turn` (014) are SECURITY DEFINER
  functions callable by `authenticated`.** Added 2026-08-23, same shape as
  `start_run`/`cancel_run` — both resolve membership from `auth.uid()`
  internally via `private.current_workspace_ids()`. `ingest_chat_turn_reply`
  (also 014) is **not** on this list and should never appear on it — like
  `claim_runtime_commands`/`ack_runtime_command`, it is service-role only; if
  it ever shows up here, a grant has been widened and a token for one
  machine could forge a reply onto another machine's turn.
- **`private.assign_or_park_chat_turn`, `private.rescan_waiting_chat_turns`,
  and `private.pick_runtime_for` (014) are not flagged by this advisor at
  all**, and that is expected, not a gap — the advisor only scans `public`.
  Checked directly (2026-08-23): `assign_or_park_chat_turn` and
  `rescan_waiting_chat_turns` carry the same default
  `anon:true, auth:true` EXECUTE grant as `private.current_workspace_ids()`
  and its siblings above — never explicitly revoked, because the actual
  boundary is schema privacy: PostgREST only exposes `public`, so nothing in
  `private` is reachable as a REST RPC regardless of its EXECUTE grants,
  exactly per this file's "Why the helpers live in `private`" section.
  `pick_runtime_for` was revoked anyway (belt-and-suspenders, not a
  requirement) since it is `stable` and side-effect-free either way.

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
