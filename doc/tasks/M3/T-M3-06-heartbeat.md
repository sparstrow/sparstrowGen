# T-M3-06 — Heartbeat loop + status derivation

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `packages/core/src/index.ts` and the web health handler, which other tasks also touch |
| **Depends on** | T-M3-03 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

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

- [x] `packages/core/src/cloud/heartbeat.ts` — `startHeartbeat()` / `stopHeartbeat()`
- [x] Wired into `packages/core/src/index.ts` next to the existing watchers, and into `shutdown()`
- [x] `draining` declared on graceful shutdown, short timeout, never blocking
- [x] Stops permanently on 403; retries with backoff on network/5xx
- [x] Re-reads the token on 401 before giving up
- [x] Transition-only logging, not per-attempt
- [x] `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_STALE_AFTER_MS` imported from `@sparstrow/shared` — not redeclared
- [x] Web side: `/api/v1/system/health` and the runtimes list derive online-ness from `last_heartbeat` age, not `status`
- [x] Unit tests with fake timers: beats on interval, backs off, stops on 403, recovers after a transient failure

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

- [ ] Start core paired; within one interval the UI shows the machine online → **deferred to T-M3-08**
- [ ] Stop core with SIGINT; the UI shows `draining` immediately, then offline → **deferred to T-M3-08**
- [ ] Kill core with SIGKILL (no graceful path); the UI shows offline within
      `HEARTBEAT_STALE_AFTER_MS`, and **nothing wrote to the row** — confirm
      `last_heartbeat` is unchanged from the last live beat → **deferred to T-M3-08**
- [ ] Disconnect the network for two minutes and reconnect; the machine returns
      to online without a restart, and the log has a handful of lines, not hundreds
      → **deferred to T-M3-08**
- [x] Revoke the token; the loop stops and says so once *(unit-tested with fake timers; live re-check in T-M3-08)*

## On completion

- [x] Tick 5.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

9 unit tests with fake timers, plus the live pairing run.

### Added a route that T-M3-02 did not have

Graceful shutdown needs somewhere to declare `draining`, and the original four
routes had nowhere. `POST /api/daemon/status` was added here, with an
**allowlist** (`draining`, `online`): `status` is free text in the schema, so
without one a daemon could write anything into a column the UI renders and M4
will later route on.

### The web side had drifted already

`/system/health` and `/system/factory-health` each carried their own hardcoded
`60_000 * 2` staleness threshold — exactly the drift `HEARTBEAT_STALE_AFTER_MS`
exists to prevent, and already inconsistent with the 90s the daemon reports.
Both now use the shared `isRuntimeOnline`.

The same handler also expected `capabilities` to be `{ providers: [...] }`,
while M3's probe writes a flat `string[]`. It would have rendered every
machine as having no providers at all. Now reads the array, defensively.

### Verified

- Beats immediately, then on the interval; starting twice does not double the rate
- **Stops permanently on 403** — retrying a revocation the owner performed
  deliberately would turn it into a request loop, and that token is never
  getting back in
- Keeps retrying through network failure, logging the *transition* rather than
  every attempt
- `declareDraining()` stops the loop first, so no in-flight beat can resurrect a
  machine that just declared it is going away
- Never throws inside shutdown — a rejection there would be the last thing in
  the log and would look like the cause of a failed exit
- The interval is `unref()`'d, so it cannot hold the process open
