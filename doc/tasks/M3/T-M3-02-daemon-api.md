# T-M3-02 — Daemon API surface in Next

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the contract core is written against |
| **Depends on** | T-M3-01 |
| **Blocks** | T-M3-03, T-M3-05, T-M3-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

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

- [ ] `packages/shared/src/cloud.ts` — request/response types + `HEARTBEAT_INTERVAL_MS` (30_000) and `HEARTBEAT_STALE_AFTER_MS` (90_000), exported so core and web cannot drift
- [ ] `apps/web/src/lib/daemon/auth.ts` — `authenticateDaemon`, with the containment comment
- [ ] Service-role Supabase client used **only** inside `lib/daemon/`, never imported by a `/api/v1` handler
- [ ] `POST /api/daemon/pair` — token generation, hashing, RPC call, single-shot response
- [ ] `POST /api/daemon/register` — upsert metadata onto the authenticated runtime id
- [ ] `POST /api/daemon/heartbeat` — `last_heartbeat = now()` server-side; returns `staleAfterMs`
- [ ] `GET /api/daemon/me`
- [ ] Map RPC errors: `22023` → 400 with the function's message, anything else → 500
- [ ] Confirm `apps/web/src/middleware.ts` lets `/api/daemon/*` through as JSON, not a `/login` redirect — M2 fixed this for `/api/`, verify the prefix still matches
- [ ] `SUPABASE_SERVICE_ROLE_KEY` read via a helper that throws a legible error when absent, matching `utils/supabase/env.ts`

## Verification

```bash
pnpm -F web typecheck && pnpm -F web vitest run
```

Against a running dev server, with a real code minted through the RPC:

- [ ] `POST /pair` with a valid code returns a token; the same code again returns 400
- [ ] `POST /heartbeat` with that token returns 200 and moves `last_heartbeat`
- [ ] `POST /heartbeat` with a garbage token returns **401**
- [ ] Set `revoked_at`; the next `POST /heartbeat` returns **403**
- [ ] `POST /register` naming a **different workspace's** runtime id in the body
      changes nothing — the body field must be ignored or absent by construction
- [ ] `curl` an unauthenticated `/api/daemon/me`; assert JSON 401, no HTML

## On completion

- [ ] Tick 5.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
