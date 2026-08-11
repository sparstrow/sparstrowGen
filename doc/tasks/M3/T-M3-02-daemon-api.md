# T-M3-02 — Daemon API surface in Next

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the contract core is written against |
| **Depends on** | T-M3-01 |
| **Blocks** | T-M3-03, T-M3-05, T-M3-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified against staging 2026-08-10 |

## Objective

Four routes under `/api/daemon/` that a paired machine can call with a bearer
token, plus the single module that resolves that token to a scope.

## The containment rule

This task is where the service role enters the codebase. Per the phase spec,
**one** module does token resolution:

```ts
// apps/web/src/lib/daemon/auth.ts
export async function authenticateDaemon(
  request: Request,
): Promise<{ workspaceId: string; runtimeId: string } | null>;
```

Every route derives its scope from that return value. **No daemon route reads a
workspace id or runtime id from the request body**, ever, for any reason. A body
-supplied id is the whole vulnerability: with the service role there is no RLS
underneath to catch it, so a daemon paired to workspace A could name workspace B
and be believed.

Write that sentence into `auth.ts` as a comment. The next person to add a route
here will not have read this file.

## Decisions already made

**Bearer token, hashed lookup.** `Authorization: Bearer <token>` →
SHA-256 → single-row lookup on `daemon_tokens.token_hash`. Constant-time
comparison is not needed: the lookup is an indexed equality on a hash of the
secret, not a comparison of the secret.

**`revoked_at` is checked on every request**, not only at pairing. This is
called out as a trap in the phase spec because a lookup keyed on `token_hash`
alone silently authenticates revoked tokens forever.

**`last_used_at` is updated on authentication**, best-effort. It is what makes
"this machine has not called home since Tuesday" answerable in the UI. Do not
await it in the request path if it costs latency — but do not skip it.

**401 for a bad token, 403 for a revoked one.** Distinguishable so the daemon
can log something useful. A revoked token means "the owner did this
deliberately"; a bad token means "your config is wrong".

## Routes

| Route | Auth | Body → Response |
|---|---|---|
| `POST /api/daemon/pair` | pairing code | `{ code, name, hostname, os, isElectron, capabilities, coreVersion }` → `{ token, runtimeId, workspaceId }` |
| `POST /api/daemon/register` | bearer | `{ hostname, os, isElectron, capabilities, coreVersion }` → `{ ok: true }` |
| `POST /api/daemon/heartbeat` | bearer | `{}` → `{ serverTime, staleAfterMs }` |
| `GET /api/daemon/me` | bearer | — → `{ runtimeId, workspaceId, name, status, lastHeartbeat }` |

`/api/daemon/pair` generates the token: 32 random bytes from
`crypto.randomBytes`, base64url. It hashes it, calls `redeem_pairing_code`, and
returns the plaintext **once**. Nothing logs it.

## Checklist

- [x] `packages/shared/src/cloud.ts` — request/response types + `HEARTBEAT_INTERVAL_MS` (30_000) and `HEARTBEAT_STALE_AFTER_MS` (90_000), exported so core and web cannot drift
- [x] `apps/web/src/lib/daemon/auth.ts` — `authenticateDaemon`, with the containment comment
- [x] Service-role Supabase client used **only** inside `lib/daemon/`, never imported by a `/api/v1` handler
- [x] `POST /api/daemon/pair` — token generation, hashing, RPC call, single-shot response
- [x] `POST /api/daemon/register` — upsert metadata onto the authenticated runtime id
- [x] `POST /api/daemon/heartbeat` — `last_heartbeat = now()` server-side; returns `staleAfterMs`
- [x] `GET /api/daemon/me`
- [x] Map RPC errors: `22023` → 400 with the function's message, anything else → 500
- [x] Confirm `apps/web/src/middleware.ts` lets `/api/daemon/*` through as JSON, not a `/login` redirect — M2 fixed this for `/api/`, verify the prefix still matches
- [x] `SUPABASE_SERVICE_ROLE_KEY` read via a helper that throws a legible error when absent, matching `utils/supabase/env.ts`

## Verification

```bash
pnpm -F web typecheck && pnpm -F web vitest run
```

Against a running dev server, with a real code minted through the RPC:

- [x] `POST /pair` with a valid code returns a token; the same code again returns 400
- [x] `POST /heartbeat` with that token returns 200 and moves `last_heartbeat`
- [x] `POST /heartbeat` with a garbage token returns **401**
- [x] Set `revoked_at`; the next `POST /heartbeat` returns **403**
- [x] `POST /register` naming a **different workspace's** runtime id in the body
      changes nothing — the body field must be ignored or absent by construction
- [x] `curl` an unauthenticated `/api/daemon/me`; assert JSON 401, no HTML

## On completion

- [x] Tick 5.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

23 assertions green (`scratchpad/daemon-api.mjs`), run against the dev server
and live staging with two disposable workspaces.

**The isolation assertion.** A daemon paired to workspace A sent `register`
naming B's runtime in five key shapes at once — `runtimeId`, `runtime_id`,
`workspaceId`, `workspace_id`, `id` — plus a hostname of `HIJACKED`. The
request returned 200, **B's runtime was untouched**, and A's own runtime took
the update. That is the design working: the ids are not read from the body at
all, so there is nothing to spoof. With the service role there is no RLS
underneath, so this is the only place that property is proved.

Also confirmed:

- Pairing returns a token whose SHA-256 matches the stored `token_hash`, and
  the plaintext is nowhere in the database
- The three redemption failures surface as distinct HTTP statuses **and**
  stable reason tokens: 409 `code_already_used`, 410 `code_expired`,
  400 `unknown_code`
- A garbage token is **401**, a revoked one **403** with `reason: "revoked"` —
  and revocation takes effect on the very next request
- Unauthenticated `/api/daemon/me` returns JSON 401, not an HTML login page
- Nothing logged the token: server logs carry status lines only

### Changed while implementing

**Heartbeat does not write `status: "online"`.** It was the obvious thing to
put there and it is wrong: `status` is for states a daemon *declares*
(`draining` at shutdown) and liveness is derived from `last_heartbeat`. Writing
it on every beat would also let a beat still in flight when shutdown declared
`draining` land afterwards and resurrect the machine. `register` still sets it,
because a booting daemon genuinely is declaring itself online.

### Noted, not acted on

Next 16 warns that the `middleware` file convention is deprecated in favour of
`proxy`. Pre-existing and unrelated to this task — the routes are confirmed
reachable as JSON — but it will need doing before a Next upgrade forces it.
