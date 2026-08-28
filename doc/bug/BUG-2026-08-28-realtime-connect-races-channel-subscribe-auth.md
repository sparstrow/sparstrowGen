# BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth

**Status:** 🟢 resolved
**Reported by:** agent — running `T-DI-05` against a real paired daemon for the first time
**Reported:** 2026-08-28

## Symptom

A real, correctly-paired daemon's Realtime control-channel subscribe was
refused every time with `Unauthorized: You do not have permissions to read
from this Channel topic: machine:<ws>:<runtime>` — even though the daemon's
minted session JWT carried the correct `sub`, `role: authenticated`, and a
direct SQL simulation of `019_daemon_realtime_identity.sql`'s policies against
that exact JWT/topic evaluated `true`.

## Reproduction

1. Pair a scratch daemon against a live deployment (`sparstrow pair <code>`).
2. Start `core` pointed at that deployment.
3. Watch its log: `cloud Realtime connection unreachable — retrying in the
   background`, detail `Unauthorized: … machine:<ws>:<runtime>`, within
   seconds of "registered this machine with the cloud control plane" — every
   time, on every backoff retry, never self-healing.

## Investigation

`packages/core/src/cloud/realtime.ts`'s `establish()`:

```js
const realtime = new RealtimeClient(wsUrl, { accessToken: () => Promise.resolve(currentToken ?? credential.token), ... });
realtime.connect();
// ... channel created here ...
channel.subscribe((status, err) => onChannelStatus(status, err));
```

`realtime-js`'s `RealtimeClient.connect()` triggers its own auth resolution
via `_setAuthSafely('connect')` — but does **not** await it; `connect()` is
synchronous and returns immediately so unrelated callers never block on a
network round trip. `RealtimeChannel.subscribe()`, called synchronously right
after, builds its join payload by reading `this.socket.accessTokenValue`
**synchronously**:

```js
if (this.socket.accessTokenValue) {
  accessTokenPayload.access_token = this.socket.accessTokenValue;
}
```

At that instant `accessTokenValue` is still `null` — the `connect()`-triggered
`setAuth()` promise hasn't resolved yet, even though its underlying
`accessToken()` callback is itself synchronous (`Promise.resolve(...)`), because
resolving a promise still needs a microtask tick. The join payload is built
with **no `access_token` key at all**, Realtime treats the join as
unauthenticated, and every policy scoped `to authenticated` refuses it.

Confirmed directly by reading `RealtimeClient.js`/`RealtimeChannel.js` from
`@supabase/realtime-js@2.112.4` (the version `packages/core` pins) rather than
guessing at the library's internals.

**Not a rare race — permanent.** `establish()` always rebuilds the
`RealtimeClient` and channel from scratch on every backoff retry (`teardown()`
tears the whole client down first), so the exact same race recurs identically
every attempt. Once `healthy` flips `false` on the first failure, later
failures are silent (`logUnhealthy`'s own dedup), which is why this had gone
unnoticed as "retrying forever" rather than "refused, then refused again,
then again."

## Impact

Total: no daemon could ever hold a Realtime connection, on any project, with
any correctly-configured RLS policy — this is upstream of and independent
from `019`'s policy correctness. Every M16/M17 terminal scenario needing the
daemon's own control channel (US1–US3) was blocked by this alone, even after
`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls` was
fixed.

## Resolution

`establish()` now awaits one `realtime.setAuth()` call, explicitly, before
constructing the channel and calling `subscribe()`:

```js
realtime.connect();
await realtime.setAuth();
const channel = realtime.channel(topic, { ... });
```

This forces the accessToken callback to resolve and populate
`accessTokenValue` before the join payload is built, so the very first join
carries the real token.

**Verified live, `T-DI-05`, 2026-08-28**, against a real paired daemon on
`development.sparstrow.com`: with the fix, the same daemon's control channel
reaches `SUBSCRIBED` with no `Unauthorized` refusal, confirmed by an explicit
status-transition log. Without the fix (reverted locally to re-check), the
refusal reproduces immediately, every time — confirming this is the actual
mechanism, not a coincidental fix.

`packages/core/src/cloud/realtime.test.ts`'s `"refreshes before the
credential expires…"` test updated to assert `setAuth` is called once at
connect time (not zero times, as it asserted before this fix existed) and
again at the 80%-of-TTL refresh — `pnpm test` green.

Landed alongside
[`BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined`](BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined.md)
(the same class of bug, browser-side) in the `task/T-DI-05-live-verification`
branch.
