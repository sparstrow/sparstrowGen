# M3 — Pairing, registration, heartbeat

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` (M3) |
| **Depends on** | M2 (complete — `/api/v1` served from Next over Supabase) |
| **Blocks** | M4 (command spine), M5, M6 |
| **Status** | done - verified on staging 2026-08-10 |
| **Open questions** | none — everything below is decided. OQ-1 is parked for M4 and touches nothing here. |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M3-01 — pairing redemption RPC](T-M3-01-redeem-rpc.md) | `[S]` | — |
| [T-M3-02 — daemon API surface in Next](T-M3-02-daemon-api.md) | `[S]` | 01 |
| [T-M3-03 — cloud client + token storage in core](T-M3-03-cloud-client.md) | `[P]` | 02 |
| [T-M3-04 — `sparstrow pair` CLI](T-M3-04-pair-cli.md) | `[P]` | 03 |
| [T-M3-05 — registration + capability probe](T-M3-05-registration.md) | `[P]` | 03 |
| [T-M3-06 — heartbeat loop + status derivation](T-M3-06-heartbeat.md) | `[C]` | 03 |
| [T-M3-07 — Runtimes UI: pair, list, revoke](T-M3-07-runtimes-ui.md) | `[P]` | 01 |
| [T-M3-08 — verification](T-M3-08-verification.md) | `[S]` | 01–07 |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

A machine running `packages/core` can be paired to a workspace, appears in the
web UI as a runtime, and stays visibly online while it is running.

**M3 does not dispatch work.** No agent runs, no commands, no `runtime_commands`
rows. That is M4. M3's entire job is to make a machine *known* and *reachable-in
-principle*, which is the prerequisite for everything M4 does.

## Definition of done

- `sparstrow pair <code>` on a fresh machine results in exactly one `runtimes`
  row and one `daemon_tokens` row, and the code cannot be redeemed twice
- The paired machine shows as **online** in the UI within one heartbeat interval
  of starting, and **offline** within `HEARTBEAT_STALE_AFTER` of stopping
- Revoking the token from the UI stops the daemon reaching the cloud on its
  next request, with a legible error in the daemon log
- A daemon token for workspace A cannot read or write anything in workspace B
- `pnpm -r typecheck` and `pnpm -r test` stay green

---

## Decisions already made

These were resolved while scoping. Do not re-open them.

### 1. The daemon talks to Next, never to PostgREST directly

**This is the decision everything else follows from.** Every RLS policy M1 built
on `runtimes`, `daemon_tokens`, `pairing_codes` and `runtime_commands` resolves
the caller through `auth.uid()` → `workspace_members`:

```sql
-- runtimes_member_all, verified live 2026-08-10
workspace_id in (select private.current_workspace_ids())
```

A daemon is not a user. It has no `auth.uid()`, no membership row, and must not
have one — a daemon token is scoped to *one runtime*, while a membership grants
the whole workspace to a person. So a daemon presenting a token to PostgREST
would match no policy and read nothing.

Therefore: the daemon calls **`/api/daemon/*` on the Next app** with
`Authorization: Bearer <daemon-token>`, and those routes use the service role
after verifying the token themselves.

> ⚠️ **The service role bypasses RLS.** M2's README warns about this for exactly
> the right reason, and M3 is the first place we deliberately step outside the
> boundary. Containment is the whole design: **one** module resolves a bearer
> token to `{ workspaceId, runtimeId }`, and every daemon route derives its
> scope from that return value and nothing else. A daemon route must never read
> a workspace id from the request body. Review any diff that does.

**Rejected alternatives**, so they are not re-litigated:

- *Give each runtime a Supabase auth user.* Makes the daemon look like a member,
  granting it the whole workspace — the opposite of a per-runtime scope.
- *Mint a custom JWT with a `runtime_id` claim.* Workable, but every policy M1
  wrote would need rewriting to read the claim, and M4 has to touch those
  policies anyway. Revisit at M4 if Realtime needs it (see note 6).

### 2. Redeeming a pairing code is one database function

Redemption is irreducibly multi-statement: check the code is unconsumed and
unexpired, create the runtime, create the token, mark the code consumed. This is
**the same shape as `bootstrap_workspace` (004) and `set_agent_skill_assignments`
(006)**, and it fails the same way if split across round trips — two daemons
redeeming the same code concurrently both pass the check and both get a token,
which is a pairing code that works twice.

`public.redeem_pairing_code(...)` in migration `008`, `SECURITY DEFINER`,
advisory-locked on the code. See [T-M3-01](T-M3-01-redeem-rpc.md).

It is **service-role only** — `revoke execute from anon, authenticated`. The
pairing code is a bearer credential, and an anon-callable redemption endpoint is
brute-forceable at whatever rate Supabase allows. Next is the rate-limiting
chokepoint.

### 3. The token is stored hashed, and shown exactly once

`daemon_tokens.token_hash` holds SHA-256 of the token; the plaintext is returned
by the redemption call and never stored server-side. M1 already revoked
`SELECT` on that column for users (and found that a column-level `REVOKE` is
silently ineffective while a table grant exists — see the policies README).

The daemon keeps its copy in the **existing encrypted secret store**,
`packages/core/src/secrets/secret-store.ts`, under the key `cloud.daemonToken`.
That store exists for precisely this class of secret and already refuses to sit
inside `dataDir` where an agent could read it.

### 4. Liveness is derived from `last_heartbeat`, never from the stored status

`runtimes.status` must not be treated as liveness. Nothing writes "offline" when
a machine dies — it dies, so it writes nothing, and a status column set to
`online` by the last successful heartbeat stays `online` forever.

Read-time rule, used everywhere status is displayed:

```
online   ⟺  now() - last_heartbeat < HEARTBEAT_STALE_AFTER
```

`HEARTBEAT_STALE_AFTER` = **90 seconds**, against a **30 second** heartbeat
interval — two missed beats plus slack, so one dropped request does not flap the
UI. Both constants live in `@sparstrow/shared` so the daemon and the web app
cannot disagree about them.

The `status` column stays, but only for states a daemon *declares* about itself
(`draining` at shutdown, later `paused`). Never for liveness.

### 5. `last_heartbeat` is set by the database clock

The heartbeat route writes `last_heartbeat = now()` in Postgres. It must not
accept a timestamp from the daemon. A machine with a skewed clock — which is
ordinary on laptops resuming from sleep — would otherwise report itself
permanently fresh or permanently stale, and the bug looks like a network fault.

### 6. Realtime is out of scope for M3

Decision 2 in the plan gives the daemon a per-runtime Realtime channel as a
command doorbell. M3 has no commands to be woken for, and the daemon cannot
authenticate to Realtime without either a Supabase session or a custom JWT
(note 1). **M4 decides that**, when there is something to receive. M3's daemon
is HTTP-only.

---

## The shape of the daemon API

Four routes, all under `apps/web/src/app/api/daemon/`. All authenticate by
bearer token except `pair`, whose credential is the pairing code itself.

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/daemon/pair` | pairing code in body | Redeem → `{ token, runtimeId, workspaceId }` |
| `POST /api/daemon/register` | bearer | Upsert hostname / OS / isElectron / capabilities / coreVersion |
| `POST /api/daemon/heartbeat` | bearer | `last_heartbeat = now()`, returns server time + stale threshold |
| `GET /api/daemon/me` | bearer | Whoami — used by the CLI to confirm pairing and by tests |

`/api/daemon/*` is **not** `/api/v1/*`. The v1 surface is the browser's, keyed
on the session cookie; this one is the daemon's, keyed on a bearer token. Mixing
them would mean one dispatcher with two auth models, which is how an endpoint
ends up accidentally reachable by the wrong caller.

The middleware already lets `/api/` through without redirecting to `/login`
(M2 fixed this so API calls get JSON 401s instead of HTML). Confirm that still
holds for `/api/daemon` — see [T-M3-02](T-M3-02-daemon-api.md).

---

## Files

| Path | Change |
|---|---|
| `packages/shared/drizzle/policies/008_redeem_pairing_code.sql` | new — the redemption RPC |
| `packages/shared/src/cloud.ts` | new — shared constants + daemon API request/response types |
| `apps/web/src/lib/daemon/auth.ts` | new — bearer → `{ workspaceId, runtimeId }`, the one containment point |
| `apps/web/src/app/api/daemon/*/route.ts` | new — the four routes above |
| `apps/web/src/lib/api/handlers/pairing.ts` | new — `POST /api/v1/pairing-codes` (browser side, user session, RLS) |
| `packages/core/src/cloud/client.ts` | new — authenticated fetch wrapper, retry, token loading |
| `packages/core/src/cloud/pairing.ts` | new — redeem + persist token |
| `packages/core/src/cloud/registration.ts` | new — capability probe + register |
| `packages/core/src/cloud/heartbeat.ts` | new — `startHeartbeat()` / `stopHeartbeat()` |
| `packages/core/src/config.ts` | edit — add `cloudUrl` |
| `packages/core/src/index.ts` | edit — start/stop heartbeat alongside the existing watchers |
| `packages/core/src/cli/pair.ts` + `package.json` `bin` | new — `sparstrow pair <code>` |
| `packages/ui/src/routes/pages/settings.tsx` | edit — Runtimes card: pair, list, revoke |

## Traps

**There is no `sparstrow` CLI today.** The plan writes `sparstrow pair <code>`
as though one exists; only `sparstrow-memory` (from `packages/memory-cli`) is
registered as a bin. T-M3-04 creates it. Do not assume an entrypoint to hang it
off.

**Capabilities come from `listProviders()`, which lists what is *registered*, not
what is *installed*.** `packages/core/src/providers/index.ts` returns the static
registry — every provider the build knows about, present or not. Registering
that verbatim tells the cloud a machine can run Claude Code when the binary is
absent, and M4 will dispatch to it. Probe actual availability. See
[T-M3-05](T-M3-05-registration.md).

**A revoked token must fail closed.** `daemon_tokens.revoked_at` is nullable;
the auth module has to check it on every request, not only at pairing. A lookup
that matches on `token_hash` alone authenticates revoked tokens forever.

**Do not log the token.** Not at debug level, not in an error path, not in the
CLI's success message. It is shown once, by the redemption response, to the
person running the command.

## Verification

Full procedure in [T-M3-08](T-M3-08-verification.md). The assertions that matter:

1. **A pairing code works exactly once.** Redeem concurrently from two callers;
   exactly one gets a token, and the loser gets a legible error.
2. **Cross-workspace isolation holds for daemon tokens**, re-proved through
   HTTP. This is the M2 lesson repeating: a handler that trusted a body-supplied
   workspace id would pass every SQL-level test and fail this one.
3. **A stopped daemon goes offline** without anything writing to its row.
4. **A revoked token is refused** on the next request.
5. **An expired code is refused**, and expiry is evaluated by the database
   clock, not the caller's.
