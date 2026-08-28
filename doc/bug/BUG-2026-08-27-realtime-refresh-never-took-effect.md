# BUG-2026-08-27-realtime-refresh-never-took-effect

**Status:** 🟢 resolved
**Reported by:** agent — found while writing `T-DI-04`, reviewing core's credential-refresh path against a Supabase-issued token whose TTL is Supabase's to choose
**Reported:** 2026-08-27

## Symptom

A paired machine's Realtime credential refresh did nothing. `refresh()` re-minted
a credential and called `setAuth` on schedule, and the client went on presenting
the **original** token from the moment it connected. The connection would
therefore die when that first token expired, no matter how many times the
refresh timer fired correctly.

Never observed running, because no daemon has ever held a Realtime connection —
see `G-47`, and the two blockers the `DI` phase exists to fix. Found by reading,
then reproduced against the unit suite.

## Reproduction

1. `packages/core/src/cloud/realtime.ts`'s `establish()` constructed the client
   with `accessToken: () => Promise.resolve(credential.token)`, closing over the
   credential minted at connect time.
2. `refresh()` later called `client.setAuth(credential.token)` with a *new*
   token.
3. Ask the client what token it would actually send — call the `accessToken`
   callback it was constructed with. It returns the **first** token, both before
   and after the refresh.

Proved mechanically rather than by argument: with the fix reverted, the new
regression test
(`realtime.test.ts` → *"actually puts the NEW token in front of the client, not
just a setAuth call"*) fails, resolving `token-1` where `token-2` is expected.
With the fix in place it passes. Both states were run.

## Investigation

`@supabase/realtime-js` 2.112's own docblock on `RealtimeClient.setAuth` states
the rule directly:

> *"When an `accessToken` callback IS configured, the callback is the source of
> truth: ... even after a bootstrap/override `setAuth(token)` call."*

and its `_setAuth` path confirms it — when `this.accessToken` is set, the token
to send is `await this.accessToken()`, ignoring any value passed to `setAuth`.
So configuring the callback and *also* calling `setAuth(token)` is not belt and
braces; the callback silently wins.

**Why no test caught it.** `realtime.test.ts` already had a refresh test, and it
asserted `expect(client.setAuth).toHaveBeenCalledWith("rt-token")` — the token
string was the same constant on both the initial mint and the refresh, so the
assertion could not distinguish a refreshed token from the original one, and
`setAuth` being *called* was never the thing in doubt. This is precisely the
failure mode `T-M16-04`'s own Result warned about in a different guise ("a green
test for a refresh that never happened"); the earlier instance was a `Response`
body being consumed twice, this one is an assertion that cannot fail.

Confirmed the bug predates `DI` and is not caused by it: the closure has been
there since `T-M16-04` shipped the module.

## Impact

**Low in practice, entirely by accident.** The code path has never run — no
daemon has ever authenticated to Realtime (`G-47`), so no connection has ever
survived long enough to need a refresh. Had the `DI` phase fixed only the
signing and RLS blockers, this would have surfaced immediately afterwards as
*"terminals work for an hour, then the machine goes quiet until it is
restarted"* — a hard failure to attribute, since every log line about refreshing
would say it succeeded.

Worth noting the TTL change makes it more visible, not less: M16 assumed a
ten-minute credential, and a Supabase session is typically an hour, so the
symptom would have been a machine that worked through a whole session of use and
then dropped.

## Resolution

Fixed in `T-DI-04`, on `task/T-DI-04-core-credential`.

- The token the callback returns is now module-level mutable state
  (`currentToken`), not a value captured in the closure, so the callback *is*
  the source of truth and always returns the current token.
- `refresh()` sets `currentToken` first, then calls `setAuth()` **with no
  argument** — realtime-js's documented way to re-pull from the callback —
  rather than the override form that the callback outranks.
- `teardown()` clears `currentToken` with the client it belonged to, so a later
  `establish()` cannot hand a stale token to a fresh connection.
- Two regression tests added, both of which fail against the old code: one
  asserting the callback returns the *new* token after a refresh, one exercising
  an hour-long TTL so nothing stays pinned to M16's ten-minute assumption. The
  pre-existing refresh test was also loosened off the token-value assertion it
  could never have failed.

Verified: `packages/core/src/cloud/` 14 files / 189 tests green with the fix;
the two new tests fail with the fix reverted, checked by actually reverting it.

**Still unverified live**, like everything else in this band — no daemon has
held a real connection yet. `T-DI-05` §B is where a refresh is watched happening
against a real deployment.
