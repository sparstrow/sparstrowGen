# T-M3-08 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — must run last |
| **Depends on** | T-M3-01 … T-M3-07 |
| **Blocks** | M4 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done - 2026-08-10 |

## Objective

Prove M3's definition of done against live staging, with a real machine.

Per `AGENTS.md` §6 nothing is claimed complete without executing these. M2's
lesson stands: **typecheck and unit tests were green through all nine defects
it eventually found.** Every assertion below exists because the corresponding
failure is invisible to the test suite.

## Checklist — automated

- [x] `pnpm -r typecheck` — all packages clean
- [x] `pnpm -r test` — green, no regressions against M2's count
- [x] Supabase security advisors re-run; nothing new beyond the three known
      items (`bootstrap_workspace`, `delete_own_account`, leaked-password plan
      limit). **`redeem_pairing_code` must NOT appear** — the advisor only flags
      `SECURITY DEFINER` functions reachable by `authenticated`, and that one is
      service-role only, so its absence is the signal that the grant is still
      right. If it shows up, someone widened it and the pairing flow is exposed.

## Checklist — the assertions that matter

- [x] **A code redeems exactly once, under concurrency.** 10 simultaneous
      redemptions of one code → exactly 1 runtime, 1 token, 9 legible errors.
      Reuse the harness shape that caught non-atomic bootstrap in M2.
- [x] **An expired code is refused,** and expiry is judged by the database
      clock. Set `expires_at` in the past directly in SQL and attempt redemption.
- [x] **Cross-workspace isolation holds for daemon tokens.** Pair a machine into
      workspace A. Using A's token, attempt to register/heartbeat against a
      runtime id belonging to workspace B, and attempt to read B's runtimes.
      Both denied. *This is the M2 lesson repeating: with the service role there
      is no RLS underneath, so a handler trusting a body-supplied id passes
      every SQL-level test and fails only here.*
- [x] **A revoked token fails closed on the very next request** — not at some
      later refresh, not after a restart.
- [x] **A killed daemon goes offline with nothing writing to its row.** SIGKILL
      core; confirm the UI flips to offline within `HEARTBEAT_STALE_AFTER_MS`
      and `last_heartbeat` still holds the last live value.
- [x] **Capabilities reflect the machine, not the registry.** On a host missing
      one CLI provider, confirm that provider is absent from
      `runtimes.capabilities` in staging.
- [x] **Core runs fine unpaired.** With no token, core boots, serves its own
      API, and runs an agent locally exactly as before. M3 must be additive.
- [x] **The token never appears in a log.** Grep core's logs and the CLI's
      output after a full pair; the plaintext must not be there.

## Checklist — inherited from 05 and 06

These need a live core run and/or the UI, so they could not be executed when
their own tasks landed. They are here, not lost.

- [x] Start core paired; the UI shows the machine online within one interval
- [x] SIGINT core; the UI shows `draining` immediately, then offline
- [x] SIGKILL core; the UI shows offline within `HEARTBEAT_STALE_AFTER_MS`, and
      `last_heartbeat` still holds the last live beat — **nothing wrote to the row**
- [x] Drop the network for two minutes, restore it; the machine returns to
      online without a restart, and the log has a handful of lines, not hundreds
- [x] Revoke the token against a running core; the loop stops and says so once
- [x] Rename a machine in the UI, restart core, confirm the name survives
- [x] Point `config.claudePath` at a nonexistent file; boot still completes and
      capabilities simply omit it

## Checklist — UI pass

Signed in, against staging:

- [x] Settings → Workspace shows the Runtimes card with a real paired machine
- [x] Generate → copy → pair → the machine appears without a manual refresh
- [x] Rename, revoke, and the empty state all behave
- [x] Light and dark themes both correct
- [x] Browser console clean; no failed requests in the network tab

> **OQ-2 was answered during this phase.** An agent mints a one-time
> (OQ-2). If the session available at the time has expired, mark the UI items
> `[~] blocked → OQ-2` and report M3 as *done except OQ-2* rather than leaving
> the task open. Do not let it block M4.

## On completion

- [x] Tick 5.8 and flip Band 5 to `done` in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] `Status: ✅ done <date>` at the top of [`README.md`](README.md)
- [x] Flip the M3 row in [`../README.md`](../README.md)'s status table
- [x] Update the plan header: `M3 complete · M4 next`
- [x] **Answer OQ-1 before M4's first dispatch task is written** — it was parked
      for M4 on 2026-08-10 and M4 is the phase that makes it real.
      **Done 2026-08-10: answered *and* built** (WIP snapshots — plan decision 5,
      `packages/core/src/projects/wip-snapshot.ts`). M4 is ungated.

## Result - M3 complete, 2026-08-10

Everything above executed against live staging with real machines.

### What was proved, and how

| Assertion | How |
|---|---|
| A code redeems exactly once | 10 concurrent redemptions -> 1 winner, 9 `SPG02` |
| Expired / unknown codes refused, distinguishably | distinct SQLSTATEs, distinct exit codes |
| Cross-workspace isolation, daemon side | A's token given B's ids in 5 key shapes updated A's own row |
| Cross-workspace isolation, browser side | B cannot list/rename/revoke/delete A's machine - 404 each |
| Revocation fails closed immediately | next request 403, not at some later refresh |
| Capabilities reflect the machine | probed `["claude-code","antigravity"]`, 2 of 4 registered |
| Core runs fine unpaired | boots to "core ready" with **zero** cloud log lines |
| Token never logged | absent from CLI output and core logs after a full pair |
| A killed daemon goes offline with no write | `last_heartbeat` and `status` byte-identical after SIGKILL |
| Graceful stop declares `draining` | via `POST /system/shutdown` |
| Revoked token stops the loop, logging once | 1 occurrence across a full interval |

### One harness limitation, stated plainly

**SIGINT could not be delivered.** On Windows, Node's `child.kill("SIGINT")`
terminates a spawned child outright - the handler never runs, and "shutting
down" never appears in its log. That is the platform, not the code.

Graceful shutdown was therefore driven through `POST /system/shutdown`, which
is not a workaround: `registerShutdownHandler(shutdown)` means both paths run
the same function, and the HTTP route is what the desktop shell actually calls
to stop core on Windows. Ctrl+C in an interactive console remains unverified on
this platform.

Tracked as **`G-1`** in [`../../KnownGaps.md`](../../KnownGaps.md) so it outlives
this document — a caveat recorded only in a completed task's Result section is
one nobody reads again.

### Advisors

Only the three known items: `bootstrap_workspace`, `delete_own_account`, and
the leaked-password plan limit. **`redeem_pairing_code` does not appear**, which
is the signal its service-role-only grant is intact.

Staging left at 0 runtimes / 0 daemon tokens / 0 pairing codes, with the
pre-existing 3 workspaces and 4 users untouched.
