# T-M3-08 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — must run last |
| **Depends on** | T-M3-01 … T-M3-07 |
| **Blocks** | M4 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

Prove M3's definition of done against live staging, with a real machine.

Per `AGENTS.md` §6 nothing is claimed complete without executing these. M2's
lesson stands: **typecheck and unit tests were green through all nine defects
it eventually found.** Every assertion below exists because the corresponding
failure is invisible to the test suite.

## Checklist — automated

- [ ] `pnpm -r typecheck` — all packages clean
- [ ] `pnpm -r test` — green, no regressions against M2's count
- [ ] Supabase security advisors re-run; nothing new beyond the three known
      items (`bootstrap_workspace`, `delete_own_account`, leaked-password plan
      limit). **`redeem_pairing_code` must NOT appear** — the advisor only flags
      `SECURITY DEFINER` functions reachable by `authenticated`, and that one is
      service-role only, so its absence is the signal that the grant is still
      right. If it shows up, someone widened it and the pairing flow is exposed.

## Checklist — the assertions that matter

- [ ] **A code redeems exactly once, under concurrency.** 10 simultaneous
      redemptions of one code → exactly 1 runtime, 1 token, 9 legible errors.
      Reuse the harness shape that caught non-atomic bootstrap in M2.
- [ ] **An expired code is refused,** and expiry is judged by the database
      clock. Set `expires_at` in the past directly in SQL and attempt redemption.
- [ ] **Cross-workspace isolation holds for daemon tokens.** Pair a machine into
      workspace A. Using A's token, attempt to register/heartbeat against a
      runtime id belonging to workspace B, and attempt to read B's runtimes.
      Both denied. *This is the M2 lesson repeating: with the service role there
      is no RLS underneath, so a handler trusting a body-supplied id passes
      every SQL-level test and fails only here.*
- [ ] **A revoked token fails closed on the very next request** — not at some
      later refresh, not after a restart.
- [ ] **A killed daemon goes offline with nothing writing to its row.** SIGKILL
      core; confirm the UI flips to offline within `HEARTBEAT_STALE_AFTER_MS`
      and `last_heartbeat` still holds the last live value.
- [ ] **Capabilities reflect the machine, not the registry.** On a host missing
      one CLI provider, confirm that provider is absent from
      `runtimes.capabilities` in staging.
- [ ] **Core runs fine unpaired.** With no token, core boots, serves its own
      API, and runs an agent locally exactly as before. M3 must be additive.
- [ ] **The token never appears in a log.** Grep core's logs and the CLI's
      output after a full pair; the plaintext must not be there.

## Checklist — inherited from 05 and 06

These need a live core run and/or the UI, so they could not be executed when
their own tasks landed. They are here, not lost.

- [ ] Start core paired; the UI shows the machine online within one interval
- [ ] SIGINT core; the UI shows `draining` immediately, then offline
- [ ] SIGKILL core; the UI shows offline within `HEARTBEAT_STALE_AFTER_MS`, and
      `last_heartbeat` still holds the last live beat — **nothing wrote to the row**
- [ ] Drop the network for two minutes, restore it; the machine returns to
      online without a restart, and the log has a handful of lines, not hundreds
- [ ] Revoke the token against a running core; the loop stops and says so once
- [ ] Rename a machine in the UI, restart core, confirm the name survives
- [ ] Point `config.claudePath` at a nonexistent file; boot still completes and
      capabilities simply omit it

## Checklist — UI pass

Signed in, against staging:

- [ ] Settings → Workspace shows the Runtimes card with a real paired machine
- [ ] Generate → copy → pair → the machine appears without a manual refresh
- [ ] Rename, revoke, and the empty state all behave
- [ ] Light and dark themes both correct
- [ ] Browser console clean; no failed requests in the network tab

> **A signed-in browser session is required and an agent cannot produce one**
> (OQ-2). If the session available at the time has expired, mark the UI items
> `[~] blocked → OQ-2` and report M3 as *done except OQ-2* rather than leaving
> the task open. Do not let it block M4.

## On completion

- [ ] Tick 5.8 and flip Band 5 to `done` in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] `Status: ✅ done <date>` at the top of [`README.md`](README.md)
- [ ] Flip the M3 row in [`../README.md`](../README.md)'s status table
- [ ] Update the plan header: `M3 complete · M4 next`
- [ ] **Answer OQ-1 before M4's first dispatch task is written** — it was parked
      for M4 on 2026-08-10 and M4 is the phase that makes it real
