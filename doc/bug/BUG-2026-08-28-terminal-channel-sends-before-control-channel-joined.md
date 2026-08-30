# BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined

**Status:** 🟢 resolved
**Reported by:** agent — running `T-DI-05` against a real paired daemon for the first time
**Reported:** 2026-08-28

## Symptom

Every browser-side `TerminalChannel.request()` call (`terminal.list`,
`terminal.open`, …) logged `Realtime send() is automatically falling back to
REST API` on its very first attempt, on every page load, for every request —
never the fast WebSocket push path.

## Reproduction

1. Sign in, open `/terminals` against a machine with an already-`SUBSCRIBED`,
   correctly-authorized control channel (confirmed independently — see
   `BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth` and
   `BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`,
   both fixed).
2. Watch the console: `Realtime send() is automatically falling back to REST
   API…` fires on the page's own first `terminal.list` call, every time.

## Investigation

`apps/web/src/lib/terminal-channel.ts`'s `ensureControlChannel()`:

```js
private ensureControlChannel(): Promise<SupabaseChannelLike | null> {
  if (!this.controlChannelPromise) {
    this.controlChannelPromise = this.workspaceId().then((workspaceId) => {
      const channel = this.supabase.channel(topic, { ... });
      channel.subscribe((status) => this.setConnected(status === "SUBSCRIBED"));
      return channel; // <-- resolves here, synchronously after subscribe() is CALLED
    });
  }
  return this.controlChannelPromise;
}
```

`channel.subscribe()` returns synchronously; the join itself is asynchronous.
The promise this method returns resolved the instant `subscribe()` was
*called*, not once the join actually settled. `request()` awaits this promise
and immediately calls `channel.send()`, which reads `realtime-js`'s own
`channelAdapter.canPush()` — `true` only once `state === 'joined'` — to decide
whether to push over the live socket or fall back to a slower REST POST to
`/realtime/v1/api/broadcast`. Every request raced the still-in-flight join and
lost, so **every single call**, not just the first, silently took the REST
path.

Confirmed by instrumenting the actual `canPush()`/`channelAdapter.state`
values at the moment of `send()`: `false`/`"joining"` before the fix,
`true`/`"joined"` after.

## Impact

Every terminal control-channel request paid REST latency and a deprecation
warning instead of using the live socket it had already paid to open — cost,
not correctness, on its own (the REST fallback does have its own working
delivery path); see
[`BUG-2026-08-28-private-broadcast-channels-not-relaying`](BUG-2026-08-28-private-broadcast-channels-not-relaying.md)
for why the REST fallback ALSO doesn't reach a subscriber on this project,
which is a distinct, deeper defect this fix doesn't touch.

## Resolution

`ensureControlChannel()` now wraps the subscribe callback in a promise that
resolves only once the first join attempt has *settled* (any terminal status
— `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` — resolves it, so a
join failure still returns the channel for `close()` to tear down rather than
hanging forever):

```js
return new Promise<SupabaseChannelLike | null>((resolve) => {
  let settled = false;
  channel.subscribe((status: string) => {
    this.setConnected(status === "SUBSCRIBED");
    if (!settled) {
      settled = true;
      resolve(channel);
    }
  });
});
```

**Verified live, `T-DI-05`, 2026-08-28**: after the fix, a fresh
`terminal.list` request logs no REST-fallback warning and shows
`canPush: true` / `channelState: "joined"` at send time — the WebSocket push
path is genuinely used now. `pnpm typecheck`/`pnpm test` green (no test
covered this promise's resolve timing before this fix; none needed updating).

Landed alongside
[`BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth`](BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth.md)
in the `task/T-DI-05-live-verification` branch.
