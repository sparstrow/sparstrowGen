# T-DI-02 — the daemon identity: schema, helper, policies

| | |
|---|---|
| **Tag** | `[S]` — the authorization contract `T-DI-03` mints against |
| **Serves** | **foundational** — closes the second of the phase's two blockers |
| **Depends on** | T-DI-01 (the policies encode its topic shape) |
| **Blocks** | T-DI-03, T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

> **Load the `supabase` and `supabase-postgres-best-practices` skills before
> writing any SQL in this task** — `AGENTS.md` §3.12, in the turn the work
> happens, not from a previous session's memory. This task creates a
> `SECURITY DEFINER` function and two RLS policies; both are on that checklist's
> sharp end.

## Objective

Give a daemon an identity the database can recognise, and two policies that let
that identity — and only that identity — read its own machine's channels and
publish the two event kinds a machine is allowed to publish.

## Decisions already made

Plan **DI-1**, **DI-3** and **DI-5** govern this task.

**`private.daemon_identities`, not a column on `runtimes`.** `runtimes` is
exposed through the Data API and readable by every workspace member; an
`auth_user_id` column there would hand every member the daemon's identity. The
`private` schema is not exposed, which is where `001_rls.sql` already puts
things only policies should read.

```sql
create table if not exists private.daemon_identities (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  runtime_id   text not null unique references public.runtimes(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now()
);
```

`runtime_id` is `unique` because one machine has exactly one identity — that
uniqueness is what makes `T-DI-03`'s lazy create-or-reuse a single upsert rather
than a race.

**The helper mirrors `private.current_admin_workspace_ids()` exactly** — same
schema, same `stable`, same `security definer`, same `set search_path = ''`.
It resolves through a **live** token, which is what makes `DI-3`'s
revocation-without-cleanup true:

```sql
create or replace function private.current_daemon_scope()
returns table (workspace_id text, runtime_id text)
language sql stable security definer set search_path = ''
as $$
  select di.workspace_id, di.runtime_id
  from private.daemon_identities di
  where di.user_id = (select auth.uid())
    and exists (
      select 1 from public.daemon_tokens dt
      where dt.runtime_id = di.runtime_id and dt.revoked_at is null
    );
$$;
```

**`(select auth.uid())`, not bare `auth.uid()`** — the wrapped form is evaluated
once per statement instead of once per row, which is the single most
consequential RLS performance rule and one M1 already had to fix once.

**The two new policies are the mirror image of `018`'s**, and the event pin is
load-bearing for the same reason `018`'s header gives at length: without it, a
compromised daemon could publish `input` onto its own session topic and forge
what the operator appears to have typed.

| Policy | Command | Topic | Event pin |
|---|---|---|---|
| `machine_channel_daemon_read` | SELECT | `machine:<ws>:<runtime>` | — |
| `machine_channel_daemon_send` | INSERT | `machine:<ws>:<runtime>` | `event = 'reply'` |
| `terminal_channel_daemon_read` | SELECT | `terminal:<ws>:<runtime>:<session>` | — |
| `terminal_channel_daemon_send` | INSERT | `terminal:<ws>:<runtime>:<session>` | `event = 'output'` |

Each checks `(split_part(topic, ':', 2), split_part(topic, ':', 3))` against
`private.current_daemon_scope()`, so a daemon is confined to its own machine's
topics — not merely to its workspace's.

**`bootstrap_workspace` gains a guard** (DI-5): if the caller has a
`private.daemon_identities` row, raise rather than provision. A daemon's access
token is a real `authenticated` JWT and can reach PostgREST; every other RPC and
table denies it for lack of membership, and this one exists precisely to serve a
member-less caller.

## Checklist

- [ ] `packages/shared/drizzle/policies/019_daemon_realtime_identity.sql` — the
      table, the helper, the four policies, written rerunnable (every policy
      dropped before it is created) exactly as `018` is
- [ ] The same `relrowsecurity` guard `018` opens with, so applying this against
      a project where RLS on `realtime.messages` is off fails loudly rather than
      giving false assurance
- [ ] `020_bootstrap_refuses_daemon.sql` — `bootstrap_workspace`'s guard, as its
      own file rather than an edit to `004`, matching this directory's
      append-only convention
- [ ] `revoke all on private.daemon_identities from anon, authenticated` — belt
      and braces; the `private` schema is not exposed, and this makes that
      explicit rather than inherited
- [ ] A `-- Verify` block listing the expected `pg_policies` rows: **ten** on
      `realtime.messages` now (010's one, 015's one, 018's four, this file's
      four), named
- [ ] Negative-test SQL in the same block, both directions: a daemon identity
      **cannot** insert `input` on its own session topic, **cannot** read or
      insert on another runtime's topics, and **cannot** read `run:` or `chat:`
      topics at all
- [ ] Applied to the project, with the project ref confirmed before and after —
      `018` re-run first (idempotent, and it changed in `T-DI-01`), then `019`,
      then `020`
- [ ] `supabase db advisors` (or MCP `get_advisors`) run after applying, with
      any new finding fixed rather than noted
- [ ] `packages/shared/drizzle/policies/README.md` — a row for each new file

## Traps

**`SECURITY DEFINER` in `public` is a public API endpoint.** `current_daemon_scope()`
goes in `private`, like its two siblings in `001_rls.sql`. A copy of it in
`public` would be callable by `anon` — Postgres grants `EXECUTE` to `PUBLIC` on
every new function by default, and `AGENTS.md` §3.12's own history records this
exact defect being caught in M1.

**Supabase restricts DDL on the `realtime` schema** (changelog, 2025-04-21 and
2026-07-14): creating or altering *objects* there fails. Creating **policies** on
`realtime.messages` is the documented Realtime Authorization mechanism and still
works — `018` was applied successfully on 2026-08-26 and `T-M16-06` §D confirmed
six rows. The new table and function go in `private`, not `realtime`.

**An `INSERT` policy needs `with check`, not `using`.** `018` gets this right;
copy its shape rather than a table policy's.

**Do not add a `SELECT` policy the daemon does not need.** A machine reads
`request` on its control topic and `input` on its session topics. It has no
reason to read another machine's anything, and `realtime.messages` SELECT is
what gates *subscribe* — a loose read policy is a machine able to watch another
machine's session.

**`daemon_tokens` is keyed by runtime, and a machine may have a revoked token
and a live one at once** (re-pairing does not delete the old row — see
`revokeRuntimeTokenAction`). The helper's `exists` must test `revoked_at is
null`, not `not exists (… revoked_at is not null)`, which would deny a
legitimately re-paired machine forever.

## Verification

- [ ] The `-- Verify` block's ten expected policies confirmed by
      `select policyname, cmd from pg_policies where schemaname = 'realtime'`
- [ ] Every negative test in that block run against a synthetic daemon session,
      inside a transaction ending in `ROLLBACK` — the pattern `T-M16-06` §D
      established and proved workable
- [ ] `private.current_daemon_scope()` returns nothing for: an ordinary member,
      an admin, and a daemon whose only token is revoked
- [ ] `bootstrap_workspace` raises for a daemon identity and still provisions
      normally for a genuinely new human user — both asserted, since a guard
      that also breaks signup is worse than the hole it closes
- [ ] `pnpm typecheck` and `pnpm test` green

**Live subscribe/broadcast is not this task's to prove** — it needs a real
credential, which `T-DI-03` mints. `T-DI-05` §A is where that closes.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
