# T-M4-01 — Command RPCs: enqueue, claim, ack

| | |
|---|---|
| **Tag** | `[S]` sequential — every other task is written against this contract |
| **Depends on** | — |
| **Blocks** | T-M4-02, T-M4-03, T-M4-07, T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

> Load the `supabase` and `supabase-postgres-best-practices` skills before
> writing any of this SQL. Mandatory per AGENTS.md §3.12, and not satisfied by
> remembering what M1 learned — M1 found three real defects this way.

## Objective

Four database functions that make dispatch atomic and exactly-once, in
`packages/shared/drizzle/policies/009_command_spine.sql`.

## Decisions already made

**Enqueue is one function, for the reason M2 defect 2 exists.** A run row and its
command row must be created together or not at all — see phase decision 3.

**Claim is one `UPDATE … RETURNING`.** Never `SELECT` then `UPDATE`: two pollers
would both see the same pending row. The same statement reclaims expired leases,
which is why expiry needs no sweeper process.

**The claim and ack functions are service-role only.** `revoke execute from anon,
authenticated`. They take a runtime id as an argument and therefore trust their
caller completely; the only caller is `/api/daemon/*`, which has already resolved
that id from a bearer token. An `authenticated`-callable claim would let any
signed-in user drain another machine's queue.

**`start_run` is the opposite** — it is called with the *user's* session and
checks membership internally via `private.current_workspace_ids()`, exactly as
M1's policies do. It is `SECURITY DEFINER` only because it writes two tables in
one transaction, not to escape RLS.

## The functions

### `public.start_run(...)` → the run row

Arguments: agent id, project id (nullable), prompt, trigger, trigger ref, task id
(nullable), target runtime id (nullable), lane.

1. Resolve the workspace from `private.current_workspace_ids()`; raise if the
   agent does not belong to it.
2. Choose the runtime — phase decision 7. Explicit target obeyed exactly;
   otherwise online (`last_heartbeat > now() - interval '90 seconds'`, matching
   `HEARTBEAT_STALE_AFTER_MS`) **and** capable **and** bound.
3. No candidate → raise with a distinguishable `errcode`, so the route can map it
   to a reason token rather than parsing English. Use `P0001` with a message
   prefix, or dedicated `SQLSTATE`s — pick one and document it in the file
   header.
4. Insert the run: `id = 'run_' || <12 chars>`, `status = 'queued'`,
   `target_runtime_id`, `task_id`.
5. Insert the command: `kind = 'run.start'`, `idempotency_key = 'run.start:' ||
   run_id`, payload carrying the run id, agent slug **and** id, project id and
   slug, prompt, lane, trigger.
6. When a task id was given, set that task to `in_progress` and stamp `run_id`.
7. Return the run row.

> The payload carries **slugs alongside ids** deliberately. The daemon resolves
> by slug (phase decision 5) and the id is what it links against; sending only
> the id would force a second round trip to learn the slug, on the hot path, for
> data the enqueuer already had.

### `public.cancel_run(p_run_id)` → the run row

Membership-checked. Enqueues `run.cancel` with
`idempotency_key = 'run.cancel:' || p_run_id`. If the run is already terminal,
return it unchanged and enqueue nothing — a cancel racing a completion is
ordinary, not an error.

### `public.claim_runtime_commands(p_runtime_id, p_limit, p_lease_ms)` → setof

```sql
update public.runtime_commands c
   set status = 'claimed',
       claimed_at = now(),
       lease_expires_at = now() + make_interval(secs => p_lease_ms / 1000.0),
       attempts = c.attempts + 1
 where c.id in (
   select id from public.runtime_commands
    where runtime_id = p_runtime_id
      and (status = 'pending'
           or (status = 'claimed' and lease_expires_at < now()))
      and attempts < 5
    order by created_at
    limit p_limit
    for update skip locked
 )
returning c.*;
```

`for update skip locked` is what makes two concurrent claims disjoint rather than
one of them blocking. `attempts < 5` is the poison-message ceiling: a command that
has been claimed and abandoned five times is not going to succeed on the sixth,
and without the ceiling it is dispatched forever. A command that hits the ceiling
is swept to `expired` by `ack` — see below.

### `public.ack_runtime_command(p_id, p_runtime_id, p_status, p_error)`

Scoped by runtime id so a token for machine A cannot ack machine B's work. Sets
`status` (`done` | `failed` | `expired`), `completed_at`, `error`. Idempotent: an
ack for an already-completed command is a no-op returning success, because the
daemon retries acks after a network failure and must not see an error for work it
did.

## Checklist

- [x] `009_command_spine.sql` with all four functions and a file header naming the error contract
- [x] Grants: `start_run` / `cancel_run` to `authenticated`; claim / ack revoked from `anon, authenticated`
- [x] Functions live in `public` only because PostgREST must expose the two user-facing ones; helpers, if any, go in `private` (M1's finding)
- [x] `search_path` pinned on every `SECURITY DEFINER` function
- [x] Applied to staging and re-run to prove idempotency (the file is rerunnable)
- [x] `packages/shared/drizzle/policies/README.md` updated with `009` in the apply order
- [x] SQL-level test: two concurrent `claim_runtime_commands` for the same runtime return disjoint sets
- [x] SQL-level test: `start_run` as a member of workspace B against workspace A's agent is denied
- [x] SQL-level test: a claimed command with `lease_expires_at` in the past is re-claimed, and `attempts` increments
- [x] SQL-level test: `attempts >= 5` is never re-claimed

## Traps

**`make_interval(secs => …)` not `p_lease_ms * interval '1 ms'`.** The latter
silently truncates in some casts.

**Do not add `runtime_commands` to the realtime publication.** Phase decision 1 —
the doorbell is M5. Publishing it now costs message budget for a channel nothing
subscribes to.

**`uq_runtime_commands_idem` is global.** A second `start_run` for the same run
id raises a unique violation; catch it and return the existing run rather than
surfacing a 500 — that is the idempotency working, not failing.

## Verification

- [x] 37 assertions in `packages/shared/drizzle/policies/verify-command-spine.mjs`, all green
- [x] Grants re-checked on live staging after applying (`has_function_privilege`)
- [x] `pg_policies` for `runtime_commands` unchanged — this task adds functions, not policies

## On completion

- [x] Tick 6.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

Applied to staging, then re-applied to prove the file is rerunnable. 37
assertions pass against a throwaway `postgres:17-alpine` container.

### Verification runs in Node, not bash

`verify-rls.sh` drives `psql` inside the container, which is fine for
single-statement assertions. The claim assertions are not that shape: proving
`SKIP LOCKED` means holding an **uncommitted** claim open in one session while a
second session claims, and asserting the second is neither blocked nor handed
the same rows. Two awaited connections express that; two `docker exec` pipes
express it badly. `verify-command-spine.mjs` sits beside its sibling and uses
the same throwaway-container discipline.

### Three things the task spec did not anticipate

**`greatest`/`least` cannot be `pg_catalog`-qualified.** Like `coalesce` and
`nullif` (which 004 and 008 already note) they are SQL constructs, not catalog
functions, so the qualified form fails to resolve under `search_path = ''`.
They are also not name-resolved through `search_path`, so leaving them bare is
safe.

**An explicit target runtime that is offline had no defined behaviour.**
Decision 7 says an explicit target is obeyed exactly, and also that offline is
not a queue — which read as a contradiction until stated precisely: *never
substitute a different machine, but still refuse if that machine cannot run it
now*. `SPG12`, with a message naming the machine. Written into the function's
comments so the next reader does not have to re-derive it.

**A poison command needed somewhere to land.** The attempts ceiling stops a bad
row being redispatched forever, but on its own it leaves that row reading
`claimed` permanently, which is a lie on the board. The claim function now
retires ceiling-hit rows to `expired` with a reason before claiming.

### Also fixed

`psql` is not installed on the Windows factory box, so the apply instructions at
the top of `policies/README.md` could not be followed there. Added
`scripts/apply-sql.mjs`, which applies any file in that directory over
`DATABASE_URL` using the `postgres` package already in the lockfile, and
documented it beside the psql commands rather than replacing them.

`scripts/migrate.mjs` still points at `0000_narrow_revanche.sql`, which no
longer exists (the migration is `0000_special_romulus.sql`). Left alone — it is
not on this task's path, and fixing it silently inside an M4 commit would hide
it. Worth its own change.
