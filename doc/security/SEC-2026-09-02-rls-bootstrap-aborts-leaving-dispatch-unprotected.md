# SEC-2026-09-02 — replaying the RLS bootstrap aborts partway, leaving the dispatch queue with no row-level security

| | |
|---|---|
| **Status** | Fixed (the abort), with two related provisioning defects still open — see Resolution |
| **Severity** | High for any newly provisioned environment; **no impact on the existing shared Supabase project** |
| **Reported by** | agent, during the 2026-09-02 restructure (Phase 0c) |
| **Reported** | 2026-09-02 |

## What's exposed

`packages/shared/drizzle/policies/001_rls.sql` is the file that enables row-level
security across the control plane. Replaying it against the **current** schema
aborted at line 188 of 233, on

```sql
alter table public.daemon_tokens enable row level security;
```

`daemon_tokens` was dropped by migration `0012`. Its policy block was not removed
in that same change, so from `0012` onward the file could no longer run to
completion.

**psql commits each statement as it goes.** There is no wrapping transaction, so
the abort was *silent and partial*: everything above line 188 applied and
everything below it did not. What sits below it is the `runtime_commands`
section — the **dispatch queue**, where inserting a row causes a process to spawn
on somebody's machine. On any environment provisioned by replaying these files,
that table ended up with row-level security **never enabled at all**.

Three other policy files fail the same way, for the same reason (they reference
objects a later migration removed): `005_harden_legacy_functions.sql`
(`auto_confirm_user()`), `008_redeem_pairing_code.sql` (`pairing_codes`), and
`031_pairing_attempts.sql` (`pairing_attempts`). Those three are benign — they
configure things that no longer exist. `019` is not; see below.

## Who can trigger it

Nobody attacks this directly — it is a **provisioning defect**, not a runtime
bug. It produces an exposure in whoever's environment is built from these files:

- With RLS disabled on `runtime_commands`, the table falls back to plain grants.
  `authenticated` holds table-level privileges on `public`, so **any signed-in
  user of that deployment could read and insert dispatch rows for any
  workspace** — i.e. enqueue commands against machines that are not theirs.
- `doc/KnownGaps.md` `G-35` already records that any workspace *member* has full
  content access. This is wider than that: without RLS the workspace boundary is
  not consulted at all.

## Evidence

Reproduced on a clean local Docker Supabase (`supabase start`), 2026-09-02:

1. `drizzle-kit push` from `packages/shared/src/db/schema.ts` → 42 tables,
   exact match against the schema.
2. Applied `policies/*.sql` in numeric order. `001_rls.sql` failed with
   `ERROR: relation "public.daemon_tokens" does not exist`.
3. Afterwards:

```
select count(*) filter (where rowsecurity) || ' of ' || count(*)
  from pg_tables where schemaname='public';
-- 42 of 43

select tablename from pg_tables
 where schemaname='public' and not rowsecurity;
-- runtime_commands
```

The single unprotected table was the dispatch queue.

**The existing shared cloud project is not affected.** It was built historically,
applying each file when the tables it referenced still existed, so `001_rls.sql`
ran to completion there. Verified reasoning, not verified directly — see
"Still open" below.

## Impact

Scoped by the fact that **no environment has actually been provisioned this way
yet**. `development` and `main` share the one existing project, which predates
the breakage. So the realistic impact was: the *next* environment anyone created
would have silently shipped an unprotected dispatch queue, and nothing in the
process would have caught it — `policies/README.md` presents the sequence as the
way to build an environment, and the abort looks like one noisy error in a long
run rather than "half your security did not apply".

This is also why it went unnoticed for so long: the failure mode requires
someone to actually replay the sequence, and until local Docker Supabase existed
there was no reason to.

## Resolution

**Fixed in this change:** the `daemon_tokens` block is removed from
`001_rls.sql`, matching the precedent the file already set for `pairing_codes`
(whose block was correctly removed when migration `0009` dropped it, with a
comment explaining exactly this hazard — the principle was understood, the
second instance was just missed). Re-verified from an empty database:
**43 of 43 tables protected, none unprotected.**

**The rule, restated in the file itself:** when a migration drops a table, its
policy block goes in the same change. A policy statement against a table that no
longer exists breaks the "safe to re-run" guarantee for every environment, fresh
or existing.

### Still open

1. **`019_daemon_realtime_identity.sql` still aborts** — `private.current_daemon_scope()`
   joins the dropped `daemon_tokens`, and nothing redefines it (`033` does not).
   Consequence on a fresh environment: the function does not exist, and the four
   daemon-side realtime policies below it — `machine_channel_daemon_read/send`
   and `terminal_channel_daemon_read/send` — are never created. Confirmed: only
   the `admin` variants are present locally. **Not fixed deliberately.** These
   protect Supabase Realtime channels, and the restructure replaces that
   transport with a server-owned WebSocket; terminals are parked under
   [`D-37`](../Deferred.md). Whoever unparks that owes this fix, and should treat
   the replacement's authorization as new work rather than assuming these
   policies come back.
2. **`apply-to-supabase.sql` is stale**, independently of RLS. Measured against
   `schema.ts`: it is missing five tables — `agent_machine_restrictions`,
   `chat_message_attachments`, `chat_turns`, `machine_shared_locations`,
   `provider_model_cache` — and still creates `pairing_codes`, dropped by
   migration `0009`. Two of the missing five are core to chat. It also aborted at
   line 1243 until fixed in this change (section 6b dropped a table section 1 no
   longer creates). **A fresh deploy from that bundle does not reproduce the
   control plane.** `drizzle-kit push` from `schema.ts` does, exactly, and is
   what local development now uses.
3. **The cloud project's actual RLS state has not been re-verified directly.**
   The reasoning that it is unaffected is sound but is reasoning. Cheap to
   confirm: run the two queries under Evidence against the shared project. Worth
   doing before anyone relies on this report's scoping.

## Related

- [`doc/KnownGaps.md`](../KnownGaps.md) `G-60` — `drizzle-kit migrate` cannot be
  used on the shared project either (empty journal, 42 tables). Same family:
  the documented provisioning path does not work and nobody had cause to run it.
- [`doc/KnownGaps.md`](../KnownGaps.md) `G-35` — flat member access, the
  narrower exposure that remains even with RLS correctly applied.
- [`doc/Deferred.md`](../Deferred.md) `D-37` — terminals and the Realtime bridge,
  which owns the still-open item 1 above.
