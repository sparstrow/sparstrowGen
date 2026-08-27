# T-DI-04 — core adapts to the new credential

| | |
|---|---|
| **Tag** | `[P]` — lives entirely in `packages/core`, shares no file with any other task here |
| **Serves** | **foundational** — the machine's half of the new credential |
| **Depends on** | T-DI-03 (its response shape) |
| **Blocks** | T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `realtime.ts` derives its refresh timer solely from the response's
      `expiresAt`, with no remaining read of a TTL constant
- [ ] A credential that arrives already expired (clock skew, a long queue) is
      re-minted rather than used — asserted, not assumed
- [ ] The existing revocation path still stops the loop for good on 403
- [ ] Tests updated for a realistic TTL: the existing suite forces a 10 s TTL
      with fake timers and should keep doing so, plus one case at an hour to
      prove nothing is accidentally hard-coded to the old order of magnitude
- [ ] `pnpm --filter @sparstrow/core typecheck` and tests green

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

- [ ] Unit tests green, including the new hour-TTL case
- [ ] With a short TTL forced, `setAuth` is called before expiry on the same
      client instance — no reconnect to refresh, the property `T-M16-04`
      established
- [ ] Live behaviour is `T-DI-05` §B's, not this task's

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
