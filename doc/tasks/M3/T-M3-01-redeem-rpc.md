# T-M3-01 — Pairing redemption RPC

| | |
|---|---|
| **Tag** | `[S]` sequential — every other task depends on this contract |
| **Depends on** | — |
| **Blocks** | T-M3-02, T-M3-07 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — applied and verified on staging 2026-08-10 |

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

> **Changed during implementation → `select … for update`.** 004 and 007 use an
> advisory lock because they serialise on a user id where the contended thing is
> the *absence* of rows — there is nothing to lock. Here the contended thing is
> one existing row with a primary key, so a row lock is the precise tool: no
> hash, no collision surface. The row is fetched **without** filtering on
> `consumed_at`, which matters: filtering would make the loser of a race see
> zero rows and report "unknown code", sending someone hunting for a typo in a
> code that was simply already used. Verified — all nine losers got SPG02.

> **Changed during implementation → `returns jsonb`.** `returns table
> (runtime_id …)` creates OUT parameters that shadow the identically-named
> columns inside the body, making every unqualified reference to
> `daemon_tokens.runtime_id` an ambiguity error. jsonb also hands PostgREST a
> single object rather than a one-element array, which is what this returns.

**The runtime id is supplied by the caller.** Next generates it so it can put it
in the token row and the response without a round trip. The function trusts it
only in the sense that it inserts it — the code is what authorises the whole
operation.

## Checklist

- [x] Write `packages/shared/drizzle/policies/008_redeem_pairing_code.sql`
- [x] Signature: `redeem_pairing_code(p_code, p_runtime_id, p_token_hash, p_name, p_hostname, p_os, p_is_electron, p_capabilities, p_core_version) returns jsonb` — see the deviation note above
- [x] `security definer`, `set search_path = ''`, everything schema-qualified
- [x] `select … for update` on the code row before judging its state — see the deviation note above
- [x] Re-read the code **inside** the lock — checking before taking it is the race
- [x] Distinct SQLSTATEs so a daemon can tell the cases apart without string-matching: `SPG01` invalid · `SPG02` already used · `SPG03` expired. Confirmed these surface through supabase-js as `error.code`.
- [x] Expiry compared against `now()`, the database clock — never a passed-in timestamp
- [x] Insert `runtimes` with `status = 'online'` and `last_heartbeat = now()`
- [x] Insert `daemon_tokens` with `label` defaulting to the hostname
- [x] `update pairing_codes set consumed_at = now(), consumed_by_runtime_id = p_runtime_id`
- [x] `revoke execute` from `public`, `anon`, `authenticated`
- [x] `comment on function` explaining the single-use guarantee
- [x] Apply to staging via the Supabase MCP `apply_migration`
- [x] Update `packages/shared/drizzle/policies/README.md` — apply order + why this one is service-role-only

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

- [x] Tick 5.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified on staging 2026-08-10

17 assertions, all passing. The ones worth naming:

- **10 concurrent redemptions of one code → exactly 1 winner, 9 refused**, and
  all nine got `SPG02` ("already used") rather than "unknown code". Exactly one
  `runtimes` row and one `daemon_tokens` row exist, and the token belongs to the
  runtime that won.
- **A consumed code stays dead**; an **expired** code is refused by the database
  clock; an **unknown** code is refused distinguishably.
- **`authenticated` and `anon` are both denied** — `permission denied for
  function redeem_pairing_code` — and the code they attempted is still unused.
- **There is no workspace parameter to pass.** The workspace comes from the
  code's own row, so a valid code cannot be aimed at another workspace.

Staging left clean: 0 runtimes, 0 daemon tokens, 0 pairing codes, and the
pre-existing 3 workspaces / 4 users untouched.

Security advisors re-run: only the three known items
(`bootstrap_workspace`, `delete_own_account`, leaked-password plan limit).
`redeem_pairing_code` does **not** appear, because the advisor only flags
`SECURITY DEFINER` functions reachable by `authenticated`. Its absence is the
signal that the grant is right.

Harness: `scratchpad/redeem-pairing.mjs`.
