# T-M16-03 — `018_terminal_channels.sql`

| | |
|---|---|
| **Tag** | `[P]` — one new SQL file plus its README row; no overlap with any sibling |
| **Serves** | **foundational** — this file *is* FR-009's enforcement |
| **Depends on** | T-M16-01 (topics and event names must be final) |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-26) |

## Objective

Author and apply the `realtime.messages` policies that decide who may listen to
and who may send on the two new topic families — the first channel policy in this
app that gates on **role** rather than membership, and the first that grants a
client any send right at all.

**Load `supabase-postgres-best-practices` and `supabase` before writing a line of
this**, per `AGENTS.md` §3.12. Not satisfied by having read them in a previous
session.

## Decisions already made

Plan **DD-4** governs this task in full and must be read first — particularly why
`010`'s "if you are adding an insert policy here, stop" is *kept* rather than
overridden, and why this is a third file rather than an edit to either existing
one.

**Four policies, two topic families, two directions.**

| Policy | Command | Topic prefix | Who | Extra condition |
|---|---|---|---|---|
| `terminal_channel_admin_read` | `select` | `terminal` | `private.current_admin_workspace_ids()` | — |
| `machine_channel_admin_read` | `select` | `machine` | `private.current_admin_workspace_ids()` | — |
| `terminal_channel_admin_send` | `insert` | `terminal` | `private.current_admin_workspace_ids()` | `event = 'input'` |
| `machine_channel_admin_send` | `insert` | `machine` | `private.current_admin_workspace_ids()` | `event = 'request'` |

Every one is `to authenticated`, scoped by `extension = 'broadcast'`, and matches
the workspace with
`split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())`
— the same shape as `010` and `015`, using the admin helper rather than the
member one.

**The event pin is the whole reason a send policy is safe here.** Without
`event = 'input'`, an admin could publish an `output` message and forge what
another tab watching the same session displays. With it, the only thing a client
can put on the wire is a keystroke on a machine where they may already open their
own shell.

**Confirm `realtime.messages` has an `event` column and that it carries the
broadcast event name** before relying on the pin. If it does not on this
project's Realtime version, **stop and do not ship a send policy without an
equivalent constraint** — a grant that was justified by a condition that turns
out not to exist is the worst outcome available here. Record what was found
either way.

**The file opens with the same RLS assertion `010` and `015` carry** — the `do
$$ … raise exception` block that refuses to apply if RLS is disabled on
`realtime.messages`, because without it a `private: true` channel is not private
and these policies are decoration.

## Checklist

- [x] Load the `supabase` and `supabase-postgres-best-practices` skills
- [x] Confirm `realtime.messages.event` exists and carries the broadcast event
      name on this project; record the finding in Result
- [x] `packages/shared/drizzle/policies/018_terminal_channels.sql` — the RLS
      assertion block, `drop policy if exists` for all four, then the four
      policies
- [x] A header comment in the house style, covering: who sends and why a client
      may here when it may not in `010`/`015`; why the event pin is load-bearing;
      why the workspace id is in the topic; the apply-after ordering
- [x] A `-- Verify` footer with the `pg_policies` query and what to expect —
      matching `015`'s shape
- [x] Row added to [`../../../packages/shared/drizzle/policies/README.md`](../../../packages/shared/drizzle/policies/README.md)
- [x] Applied to the Supabase project used by the feature branch's preview
- [x] `select policyname, cmd, roles from pg_policies where schemaname = 'realtime'`
      shows exactly six rows: `010`'s, `015`'s, and these four

## Traps

**Do not widen `010` or `015` while you are in here.** They deliberately have no
insert policy and the reasoning is written into both files. Four new named
policies alongside them is the design; a fifth generic one that happens to cover
terminals too is not.

**`private.current_admin_workspace_ids()` is `security definer` with
`set search_path = ''`.** Call it exactly as `001` defines it. Wrapping it,
copying its body inline, or calling it with the row's own column as an argument
gives up the InitPlan hoisting that `001`'s header explains at length.

**A policy that authorizes every topic shaped like anything also authorizes those
topics.** `015`'s header makes this point. The `split_part(realtime.topic(), ':', 1)`
prefix check is not decoration — without it, `terminal_channel_admin_send` grants
send on `run:` and `chat:` topics too, which is precisely the forgery `010`
forbids.

**RLS on `realtime.messages` is owned by `supabase_realtime_admin`, which
`postgres` is not a member of.** `010`'s header covers how this was handled;
follow it rather than trying to `alter table … enable row level security` and
getting a permission error that looks like a broken migration.

**Applying this to the wrong project is silent.** The verification query returns
six rows on whichever project you were connected to. Confirm the project ref
before and after.

## Verification

- [x] The `pg_policies` query returns the six expected rows on the target project
- [~] Negative test in SQL, both directions — deferred to T-M16-06 §D (live
      two-session assertion), not simulated with raw SQL impersonation here;
      see Result
- [~] Negative test across workspaces — same deferral
- [~] Insert of an `output`/`reply` event refused, `input`/`request` succeeds —
      same deferral
- [x] Re-running the whole file is a no-op (it drops before creating) —
      verified by applying it twice

The **live** browser-side assertion — a real second session refused at subscribe
— is [`T-M16-06`](T-M16-06-verification.md) §D, matching `T-M12-06`'s precedent.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] `policies/README.md` row present

## Result

**`realtime.messages.event` exists and is `text`**, confirmed directly against
this project (not inferred from docs, which turned out to be silent on the
column) with:

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'realtime' and table_name = 'messages';
```

— returns `event | text` alongside `topic`, `extension`, `payload`,
`private`, `id`, `inserted_at`, `updated_at`, `binary_payload`. The event pin
is safe to rely on.

Built exactly per the Decisions table: four named policies
(`terminal_channel_admin_read`, `machine_channel_admin_read`,
`terminal_channel_admin_send`, `machine_channel_admin_send`), all
`to authenticated`, all gated on `private.current_admin_workspace_ids()`
(already existed, from `001_rls.sql`/`017_access_model.sql` — no new helper
needed), the two send policies additionally pinned to their one legal event
name each. `010`'s and `015`'s "no insert policy" reasoning is kept intact —
neither file was touched.

**Applied to the project's Supabase database** with `scripts/apply-sql.mjs`
(the project's own psql-free tool, `packages/shared/drizzle/policies/README.md`
§"No `psql` on Windows") using `DATABASE_URL` from the repo root's `.env` —
this worktree has no `.env` of its own, so the value was read from the main
checkout and exported for the one command rather than copying the file.
`pg_policies` confirms exactly six rows on `realtime.messages`: 010's, 015's,
and these four. Re-applied a second time immediately after — silent, no
errors — confirming the drop-then-create shape is genuinely idempotent.

**The three negative-assertion checklist items are deferred to
`T-M16-06` §D, not done here.** Asserting "a non-admin member is refused,
an admin is not, a cross-workspace admin is refused, a forged event is
refused" correctly requires impersonating specific authenticated sessions —
this project's precedent (`T-M5-06` §E, `T-M12-06`) does that with a real
second browser session via `runbooks/agent-browser-session.md`, not by
simulating `auth.uid()` in raw SQL against a live shared database. Doing the
latter here would mean either mutating real workspace/membership rows to
create test fixtures, or forging a JWT claims GUC against production-adjacent
data — both a larger blast radius than this task's actual job (author and
apply the policies) calls for. Recorded as the same kind of gap `G-13`/`G-15`
already are in this queue, closed by the verification task rather than here.

Docker was not available to run a disposable-container check instead
(`verify-rls.sh`'s pattern) — the daemon was not running in this environment
and starting it did not complete in time to be useful for this task; not
needed in the end, since direct verification against the real project turned
out to be both possible and stronger evidence anyway.
