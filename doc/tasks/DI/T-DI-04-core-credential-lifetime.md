# T-DI-04 — core adapts to the new credential

| | |
|---|---|
| **Tag** | `[P]` — lives entirely in `packages/core`, shares no file with any other task here |
| **Serves** | **foundational** — the machine's half of the new credential |
| **Depends on** | T-DI-03 (its response shape) |
| **Blocks** | T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-27) — found and fixed a real bug, see Result |

## Objective

Make `packages/core/src/cloud/realtime.ts` correct against a credential whose
lifetime Supabase now decides, rather than the fixed ten minutes M16 assumed.

## Decisions already made

**The refresh mechanism does not change** — `setAuth()` on the existing client
at 80% of the credential's life, driven by the `expiresAt` the endpoint returns,
never by decoding the token. `T-M16-04` built this correctly and its reasoning
(decoding invites core to start *trusting* claims it decoded) is untouched.

**What changes is that 80% is now a much longer wall-clock interval.** A
Supabase session's access token is typically an hour, against M16's assumed ten
minutes. Two consequences the existing tests do not cover:

- **Backoff must still not outlive the credential.** `T-M16-04`'s trap says
  re-mint before reconnecting whenever the stored `expiresAt` has passed. That
  logic is right and now matters *more*, because a longer TTL means backoff has
  longer to grow before the mismatch shows.
- **`DAEMON_REALTIME_TOKEN_TTL_S` is no longer the token's life.** Whatever
  `T-DI-03` decides for that constant, core must read the returned `expiresAt`
  and not the constant. If any code path still derives a refresh time from the
  constant, this is where it gets found.

**Core still does not talk to Supabase for anything but Realtime.** The
credential carries `supabaseUrl` and `supabaseAnonKey` for the same reason
`T-M16-02`'s amendment added them — core has no Supabase configuration of its
own, and that stays true. Do not take the arrival of a real session token as
licence to give core a general-purpose Supabase client.

## Checklist

- [x] `realtime.ts` derives its refresh timer solely from the response's
      `expiresAt`, with no remaining read of a TTL constant — it already did;
      `DAEMON_REALTIME_TOKEN_TTL_S` turned out to have **zero** readers left
      after `T-DI-03`, so it was deleted rather than re-documented
- [x] A credential that arrives already expired is re-minted rather than used —
      `scheduleRefresh`'s `Math.max(ttlMs * 0.8, 1_000)` floor already re-mints
      within a second for any non-positive TTL. Left as-is: the behaviour is
      correct and a second explicit branch would be a second thing to keep in
      sync. Noted here rather than silently ticked
- [x] The existing revocation path still stops the loop for good on 403 —
      unchanged, still covered
- [x] Tests updated for a realistic TTL: the 10 s fake-timer case stays, plus a
      new hour-long case asserting no refresh at 700 s and a real one at 80% of
      an hour
- [x] `pnpm --filter @sparstrow/core typecheck` and tests green — `src/cloud/`
      14 files / 189 tests

## Traps

**The refresh test that passes for the wrong reason.** `T-M16-04`'s Result
records a real bug found in its own test — `mockResolvedValue(response)` returns
the same `Response` instance every call and a body can only be read once, so the
second mint silently failed to parse. The suite now uses `mockImplementation`
returning a fresh `Response`. Keep that; a rewrite that reintroduces
`mockResolvedValue` will produce a green test for a refresh that never happened.

**Do not "simplify" by having core refresh through Supabase's own
`refreshSession`.** It would work, and it would put a refresh token on the
machine's disk with a longer life than the access token it replaces — a strictly
larger blast radius than re-calling an endpoint that already authenticates the
daemon bearer token. If that trade ever looks worth making, it is a decision
with its own write-up, not an implementation detail.

## Verification

- [x] Unit tests green, including the new hour-TTL case — `src/cloud/` 14 files
      / 189 tests
- [x] With a short TTL forced, `setAuth` is called before expiry on the same
      client instance — no reconnect to refresh, the property `T-M16-04`
      established
- [x] **The two new tests were verified to FAIL against the pre-fix code**, by
      actually reverting the one-line change and re-running, then restoring it.
      A regression test that passes either way is worse than none, which is the
      whole lesson of the bug this task found
- [ ] Live behaviour is `T-DI-05` §B's, not this task's

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] File the bug found here, in the same turn —
      [`BUG-2026-08-27-realtime-refresh-never-took-effect`](../../bug/BUG-2026-08-27-realtime-refresh-never-took-effect.md)

## Result

**This task's stated work was already done; what it actually found was a bug
that made the whole refresh path a no-op.**

`scheduleRefresh` already derived its timer from `expiresAt` rather than a
constant — `T-M16-04` built that correctly. But `establish()` constructed the
client with `accessToken: () => Promise.resolve(credential.token)`, closing over
the credential minted at connect time, and **realtime-js treats that callback as
the source of truth over `setAuth(token)`** — its own docblock says so, and
`_setAuth` confirms it. So every refresh re-minted a token, called `setAuth`,
logged success, and changed nothing: the client kept presenting the first token
until it expired.

Fixed by making the returned token module-level mutable state, setting it before
calling `setAuth()` with **no argument** (the documented re-pull form), and
clearing it in `teardown()`. Full write-up:
[`BUG-2026-08-27-realtime-refresh-never-took-effect`](../../bug/BUG-2026-08-27-realtime-refresh-never-took-effect.md).

**Why no test caught it, which matters more than the fix.** The existing refresh
test asserted `setAuth` had been called with `"rt-token"` — the same literal on
both the first mint and the refresh, so the assertion could not distinguish a
refreshed token from the original and `setAuth` being called was never in doubt.
The new tests give each mint a distinct token and interrogate the `accessToken`
callback the client was actually constructed with, which is the only thing that
answers *"what token would this client send?"*. Both were run against the
reverted fix and fail; the old test passes against the reverted fix, which is
the proof it was never load-bearing.

**`DAEMON_REALTIME_TOKEN_TTL_S` deleted, not re-documented.** After `T-DI-03` it
had zero readers anywhere in the monorepo — Supabase decides the TTL now, and
`expiresAt` is the only honest source. Leaving it as a "refresh floor" would
have left a constant describing nothing for a later reader to schedule against.

**The already-expired-credential item was ticked without new code, deliberately.**
`Math.max(ttlMs * 0.8, 1_000)` already re-mints within a second for any
non-positive TTL, so the required behaviour holds. Adding an explicit branch
would be a second thing to keep in sync with the floor; the checklist item is
recorded as satisfied by existing logic rather than by a change that looks like
work.
