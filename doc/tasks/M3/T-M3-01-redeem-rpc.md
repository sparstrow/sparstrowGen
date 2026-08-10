# T-M3-01 — Pairing redemption RPC

| | |
|---|---|
| **Tag** | `[S]` sequential — every other task depends on this contract |
| **Depends on** | — |
| **Blocks** | T-M3-02, T-M3-07 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

One database function that turns a valid pairing code into a runtime and a
daemon token, atomically, exactly once.

## Why this is a function and not three API calls

Redemption is four statements that must all happen or none:

1. Find the code; reject if consumed, expired, or absent
2. Insert a `runtimes` row
3. Insert a `daemon_tokens` row referencing it
4. Mark the code consumed, recording which runtime took it

Split across PostgREST round trips this has two failure modes that are not
theoretical. Two daemons redeeming the same code concurrently both read it as
unconsumed and both get working tokens — a single-use credential that worked
twice. And a failure between steps 2 and 3 leaves a runtime with no token,
which shows in the UI as a machine that exists and can never connect.

This is the third time this exact shape has come up — `bootstrap_workspace`
(004) and `set_agent_skill_assignments` (006) were both this, and both were
found as live defects rather than predicted. PostgREST cannot span statements;
multi-statement invariants live in the database.

## Decisions already made

**Service-role only.** `revoke execute from public, anon, authenticated`. The
pairing code is a bearer credential and an anon-callable redemption RPC is
brute-forceable directly against PostgREST, bypassing any rate limit Next
applies. The only caller is `/api/daemon/pair`.

**The function receives the token hash, never the token.** Next generates the
secret, hashes it, passes the hash. The plaintext never touches Postgres — not
as an argument (arguments appear in `pg_stat_statements` and error messages),
not in a column.

**Advisory lock on the code, not the workspace.** Two different codes redeeming
at the same time have no reason to block each other; two callers racing on the
*same* code are exactly what needs serialising.

**The runtime id is supplied by the caller.** Next generates it so it can put it
in the token row and the response without a round trip. The function trusts it
only in the sense that it inserts it — the code is what authorises the whole
operation.

## Checklist

- [ ] Write `packages/shared/drizzle/policies/008_redeem_pairing_code.sql`
- [ ] Signature: `redeem_pairing_code(p_code text, p_runtime_id text, p_token_hash text, p_name text, p_hostname text, p_os text, p_is_electron boolean, p_capabilities jsonb, p_core_version text) returns table (runtime_id text, workspace_id text)`
- [ ] `security definer`, `set search_path = ''`, everything schema-qualified
- [ ] `pg_advisory_xact_lock(hashtextextended('sparstrow.pair:' || p_code, 0))` before reading the code
- [ ] Re-read the code **inside** the lock — checking before taking it is the race
- [ ] Reject with distinct error codes: absent/consumed → `22023`, expired → `22023` with a distinguishable message
- [ ] Expiry compared against `now()`, the database clock — never a passed-in timestamp
- [ ] Insert `runtimes` with `status = 'online'` and `last_heartbeat = now()`
- [ ] Insert `daemon_tokens` with `label` defaulting to the hostname
- [ ] `update pairing_codes set consumed_at = now(), consumed_by_runtime_id = p_runtime_id`
- [ ] `revoke execute` from `public`, `anon`, `authenticated`
- [ ] `comment on function` explaining the single-use guarantee
- [ ] Apply to staging via the Supabase MCP `apply_migration`
- [ ] Update `packages/shared/drizzle/policies/README.md` — apply order + why this one is service-role-only

## Verification

Concurrency is the whole point, so prove it rather than reasoning about it:

```
1. Insert a pairing code expiring in 10 minutes.
2. Fire N=10 concurrent redeem_pairing_code calls with distinct runtime ids.
3. Assert: exactly 1 returns a row; 9 raise. Exactly 1 runtimes row and
   1 daemon_tokens row exist for that code.
4. Insert an already-expired code; assert redemption raises.
5. Re-redeem the consumed code from step 2; assert it raises.
```

The 10-concurrent shape is the same harness that caught the non-atomic
`bootstrap_workspace` in M2 — reuse it.

## On completion

- [ ] Tick 5.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
