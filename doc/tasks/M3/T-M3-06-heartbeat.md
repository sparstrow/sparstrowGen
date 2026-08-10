# T-M3-06 — Heartbeat loop + status derivation

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `packages/core/src/index.ts` and the web health handler, which other tasks also touch |
| **Depends on** | T-M3-03 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

A running daemon looks online. A stopped one looks offline, without anything
having written to its row.

## The decision that shapes this task

**Liveness is derived, never stored.** Nothing writes `offline` when a machine
dies — it dies, so it writes nothing. A `status` column last set to `online` by
a successful heartbeat stays `online` forever, and the UI confidently shows a
machine that has been off for a week.

Everywhere status is displayed:

```
online  ⟺  now() - last_heartbeat < HEARTBEAT_STALE_AFTER_MS
```

Both constants come from `@sparstrow/shared` (T-M3-02) so the daemon's interval
and the web app's staleness window cannot drift apart. 30s interval, 90s stale
— two missed beats plus slack, so a single dropped request does not flap a
machine offline and back.

`runtimes.status` survives for states a daemon **declares about itself**:
`draining` on graceful shutdown, `paused` later. Never for liveness.

## Decisions already made

**Heartbeat starts alongside the other watchers in `index.ts`,** next to
`startScheduler()`, `initDelegationWatcher()` and friends, and stops in the
existing `shutdown()` handler which already tears those down in order. Follow
that shape exactly — it is the file's established pattern.

**Graceful shutdown declares `draining`.** The `shutdown()` path has time for
one request. Sending it means the UI shows "shutting down" instead of waiting
90 seconds to notice, and it distinguishes a deliberate stop from a crash.
Best-effort with a short timeout: shutdown must not block on the network.

**On `CloudAuthError` (403, revoked), stop the loop.** Do not keep beating
against a token the owner deliberately revoked. Log once, clearly, naming that
the machine needs re-pairing.

**On network failure, keep trying.** That is a laptop closing its lid, not an
error. Back off, and log the *transition* into and out of failure rather than
every attempt — a machine offline overnight must not produce 1,000 log lines.

**Re-read the token from the secret store when a beat fails with 401.** This is
what lets `sparstrow pair` on a running core eventually take effect without a
restart. The CLI still says "restart core" (T-M3-04) because that is immediate
and honest, but the loop recovering on its own is strictly better than not.

## Checklist

- [ ] `packages/core/src/cloud/heartbeat.ts` — `startHeartbeat()` / `stopHeartbeat()`
- [ ] Wired into `packages/core/src/index.ts` next to the existing watchers, and into `shutdown()`
- [ ] `draining` declared on graceful shutdown, short timeout, never blocking
- [ ] Stops permanently on 403; retries with backoff on network/5xx
- [ ] Re-reads the token on 401 before giving up
- [ ] Transition-only logging, not per-attempt
- [ ] `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_STALE_AFTER_MS` imported from `@sparstrow/shared` — not redeclared
- [ ] Web side: `/api/v1/system/health` and the runtimes list derive online-ness from `last_heartbeat` age, not `status`
- [ ] Unit tests with fake timers: beats on interval, backs off, stops on 403, recovers after a transient failure

## Traps

**M2 already pointed `/system/health` at the `runtimes` table** and rewired the
`system_health` Realtime case in `apps/web/src/components/providers.tsx` to
subscribe to `runtimes`. Read what M2 built before changing it; this task
refines the status derivation, it does not rebuild the endpoint.

**Do not let the heartbeat hold the process open.** An interval timer with no
`unref()` keeps Node alive and turns a clean exit into a hang. Core's shutdown
path calls `process.exit(0)`, so this is survivable — but a hang before that
line is exactly the wedge the startup watchdog exists to complain about.

## Verification

- [ ] Start core paired; within one interval the UI shows the machine online
- [ ] Stop core with SIGINT; the UI shows `draining` immediately, then offline
- [ ] Kill core with SIGKILL (no graceful path); the UI shows offline within
      `HEARTBEAT_STALE_AFTER_MS`, and **nothing wrote to the row** — confirm
      `last_heartbeat` is unchanged from the last live beat
- [ ] Disconnect the network for two minutes and reconnect; the machine returns
      to online without a restart, and the log has a handful of lines, not hundreds
- [ ] Revoke the token; the loop stops and says so once

## On completion

- [ ] Tick 5.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
