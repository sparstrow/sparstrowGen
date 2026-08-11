# T-M3-03 — Cloud client + token storage in core

| | |
|---|---|
| **Tag** | `[P]` parallel — new directory, no shared files with 04–07 |
| **Depends on** | T-M3-02 (contract) |
| **Blocks** | T-M3-04, T-M3-05, T-M3-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-10 |

## Objective

`packages/core/src/cloud/client.ts` — the one place core makes an authenticated
request to the control plane, and the one place the daemon token is read.

## Decisions already made

**The token lives in the existing encrypted secret store**, key
`cloud.daemonToken`, via `setSecret`/`getSecret` in
`packages/core/src/secrets/secret-store.ts`. That store already refuses to sit
inside `dataDir` where a Bash-capable agent could read it, and already exists
for the GitHub PAT and provider API keys. Add the key constant next to
`SECRET_GITHUB_PAT`.

**`config.cloudUrl`** is new, defaulting to the deployed web app and overridable
with `SPARSTROW_CLOUD_URL` — the same shape every other path in `config.ts`
uses. Local development points it at `http://localhost:3000`.

**Unpaired is a normal state, not an error.** A machine with no token is a
machine nobody has paired yet. `client.ts` exposes `isPaired()`; callers check
it and stay quiet. Core must boot, run agents locally, and serve its own API
exactly as it does today with no cloud at all — M3 adds a capability, it does
not add a dependency.

**Retry is bounded and silent-ish.** Network failure is the expected case on a
laptop, not an exception. Retry with backoff, log at `warn` once per transition
into failure rather than once per attempt, and never let a cloud failure reject
into core's startup path.

## Checklist

- [x] `SECRET_CLOUD_DAEMON_TOKEN = "cloud.daemonToken"` in `secret-store.ts`
- [x] `config.cloudUrl` + `SPARSTROW_CLOUD_URL` override, with a doc comment matching the file's style
- [x] `packages/core/src/cloud/client.ts`:
  - [x] `isPaired(): boolean`
  - [x] `getRuntimeId(): string | null` (cached from the pairing response)
  - [x] `cloudFetch(path, init)` — attaches the bearer token, JSON in/out, typed against `@sparstrow/shared`'s cloud types
  - [x] Throws a typed `CloudAuthError` on 401/403 so callers can distinguish "revoked" from "offline"
  - [x] Bounded retry with backoff on 5xx and network errors; **no retry on 4xx**
  - [x] A request timeout — an unreachable host must not hang a heartbeat forever
- [x] The token is never logged, including in error paths
- [x] Unit tests with `fetch` stubbed: unpaired, happy path, 401, 403, 5xx-then-success, timeout

## Traps

**Do not retry a 403.** A revoked token will never start working, and retrying
it turns a deliberate revocation into a request loop against the control plane.

**Cache the token, but invalidate on `CloudAuthError`.** Reading the encrypted
store on every heartbeat is wasteful; holding a revoked token in memory forever
after re-pairing is worse.

## Verification

```bash
pnpm -F @sparstrow/core vitest run src/cloud
pnpm -r typecheck
```

- [x] With no token set, `isPaired()` is false and core boots normally
- [x] Core's existing test suite stays green — this task adds a module, it must
      not change any existing behaviour

## On completion

- [x] Tick 5.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — 2026-08-10

15 unit tests, `packages/core/src/cloud/client.test.ts`. Core's suite went
479 → 494 with no existing test touched: this task adds a module, it changes
no behaviour.

### Decided while implementing

**`config.cloudUrl` defaults to `http://localhost:3000`, not a production URL.**
The task said "the deployed web app" — there isn't one yet, and pointing the
default at a URL that does not exist would make "cannot reach the cloud" the
normal first experience on every machine. Set `SPARSTROW_CLOUD_URL` at deploy
time. Same shape as `ollamaHost`, which also defaults to a local address.

**Pairing state is three secrets, written and cleared together.** The token is
a bearer credential and belongs in the encrypted store; `cloud.runtimeId` and
`cloud.workspaceId` are not secret but live beside it so pairing is written and
cleared in one place. A token with no runtime id is a machine that
authenticates but cannot identify itself — `isPaired()` reports all-or-nothing
so `sparstrow pair` is the fix rather than a confusing partial state. Covered
by a test.

**A rejected token is evicted from the in-memory cache immediately.** Caching
avoids decrypting a file every 30 seconds, but holding a token the server just
refused would mean re-pairing has no effect until the process restarts.
