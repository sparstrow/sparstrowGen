# T-M16-02 — daemon Realtime credential

| | |
|---|---|
| **Tag** | `[P]` — two new files under `apps/web`, shared with nothing else in this phase |
| **Serves** | **foundational** — the piece M5 named and declined; without it the daemon cannot receive a keystroke |
| **Depends on** | T-M16-01 |
| **Blocks** | T-M16-04, T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-26) |

## Objective

Let a paired machine obtain a short-lived, workspace-scoped credential that
Supabase Realtime will accept, using the daemon bearer token it already holds.
One endpoint, one signing helper, no new authentication model for anything else.

## Decisions already made

Plan **DD-2** governs this task in full. What it leaves to implementation:

**Which signing path this project uses.** Supabase projects created before the
asymmetric-JWT rollout have a shared HS256 secret; later ones have a signing
keypair and no shared secret. **Establish which before writing the signer** —
Supabase dashboard → Settings → API → JWT keys. Do not infer it from the anon
key's algorithm alone; a project mid-migration serves both.

- **Shared secret (HS256):** sign with `SUPABASE_JWT_SECRET`. Use `jose`'s
  `SignJWT` with `HS256`; do not hand-roll base64url.
- **Signing keys (ES256/RS256):** sign with the project's current private signing
  key, and set the `kid` header to that key's id so Realtime can select it from
  the published JWKS. The key is read from a new server-only env var; it is never
  the anon key and never the service role key.

Either way the secret is **server-only** and must not appear in any
`NEXT_PUBLIC_*` name. Add the chosen variable to the Vercel project for all three
environments.

**The claims, exactly:**

```ts
{
  role: "authenticated",
  aud: "authenticated",
  iat: <now>,
  exp: <now + DAEMON_REALTIME_TOKEN_TTL_S>,
  workspace_id: <resolved from the bearer token>,
  runtime_id: <resolved from the bearer token>,
}
```

**No `sub`.** DD-2 and the phase README's second trap explain why this is not a
style preference: a nanoid in `sub` makes `auth.uid()` raise on its `uuid` cast
inside `private.current_workspace_ids()`, which `010` and `015` both call, so the
damage lands on run transcripts and chat rather than on terminals.

**The route re-uses the existing daemon resolver.** Every `/api/daemon/*` route
already resolves a bearer token to `{ runtimeId, workspaceId }`; use the same
helper, so a revoked pairing is refused here by the same code path that refuses
it everywhere else. Nothing in this task re-implements token checking.

**Refusals are the existing ones.** 401 for an unknown or malformed token, 403
for a revoked pairing — matching what `client.ts`'s `CloudAuthError` already
distinguishes, so core's existing "stop the loop, tell them to re-pair" behaviour
works unchanged.

## Checklist

- [x] Establish which signing path this project uses; record the answer in this
      task's Result section — the next person must not have to look it up again
- [x] `apps/web/src/lib/daemon/realtime-token.ts` — `mintRealtimeToken({ workspaceId, runtimeId })`,
      returning `{ token, expiresAt }`
- [x] `apps/web/src/app/api/daemon/realtime/token/route.ts` — `POST`, bearer auth
      via the existing resolver, returns the minted credential
- [x] The signing secret is read once, from a server-only env var, with a clear
      thrown error naming the variable if it is absent — the same shape
      `broadcast.ts`'s `serviceRoleKey()` uses
- [x] Unit tests: claims are exactly as specified; **there is no `sub` claim**;
      `exp` is `DAEMON_REALTIME_TOKEN_TTL_S` ahead of `iat`; an absent secret
      throws by name
- [x] Route tests: no token → 401; revoked pairing → 403; valid → 200 with a
      token that verifies against the signing key
- [x] A row in [`../../runbooks/README.md`](../../runbooks/README.md) for the
      owner: set the signing variable on the Vercel project
- [x] `apps/web` typecheck and tests green

## Traps

**Never mint from the service role key.** It is a JWT and Realtime would accept
it, which makes this a tempting shortcut. `AGENTS.md` §4 is explicit that it is
server-side only and never ships to a daemon; a machine holding it can read and
write every workspace in the project, bypassing RLS entirely.

**The token is not logged, at any level, including in error paths.** Same rule
`client.ts` states for the daemon token. A minted credential in a Vercel log is a
credential.

**`expiresAt` is for the daemon's refresh timer, not for validation.** Return it
as an ISO string alongside the token rather than making core decode the JWT to
find out when to refresh — decoding invites core to start *trusting* claims it
decoded.

**A 403 here means the pairing was revoked, and core already knows what to do
with that.** Do not invent a new error body; matching the existing shape is what
lets `CloudAuthError` classify it without a second parser.

## Verification

- [x] `pnpm --filter web test` green including the new route tests
- [x] A test decodes a freshly minted token and asserts the claim set matches
      the table above **and that `sub` is absent**
- [~] Against a real deployment: `curl -XPOST .../api/daemon/realtime/token` —
      not run. The route is correct and unit-tested, but exercising it live
      needs `SUPABASE_JWT_SIGNING_KEY` set on the deployment first, which is
      the owner action this task added to `runbooks/README.md`
- [~] The minted token is accepted by Realtime — proved in
      [`T-M16-06`](T-M16-06-verification.md) §A, not here, because it needs the
      policies from `T-M16-03` (done) and the owner action above, both

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] Confirm the runbook row is present and accurate

## Result

**Amended 2026-08-26 (during `T-M16-04`):** the response now also carries
`supabaseUrl` and `supabaseAnonKey`, and the return type moved from a local
`MintedRealtimeToken` interface to `@sparstrow/shared`'s `RealtimeCredential`.
Discovered building `T-M16-04`: core has never talked to Supabase directly
before M16 — it only ever calls `/api/daemon/*` on the Next app — so it has
no separately configured Supabase URL or anon key to pair with the token.
Both are already public values (the anon key ships to every browser), so
returning them from this same endpoint costs zero new machine-side
configuration. Purely additive to the response shape; nothing before this
consumed it.

**This project signs with an ES256 key pair, not the legacy shared HS256
secret.** Confirmed by fetching the project's own
`/auth/v1/.well-known/jwks.json` (public, no auth needed) rather than
inferring it from the anon key, per this task's own warning that a project
mid-migration serves both: it returned exactly one key,
`{"alg":"ES256","kty":"EC","crv":"P-256","kid":"1ee0a572-eaf2-4110-b43f-9f60462fdec7", ...}`.
So `mintRealtimeToken` signs with `jose`'s `SignJWT` under `ES256` and sets
the `kid` header from the signing key's own `kid`.

The private half of that key is not obtainable by an agent — the JWKS only
ever publishes the public verification key, and there is no MCP/API access in
this session that can read a project's private signing material (Supabase
MCP requires an interactive OAuth grant this session doesn't have). It reads
the whole key as one JSON JWK from a new server-only env var,
`SUPABASE_JWT_SIGNING_KEY`, and throws by name (matching `broadcast.ts`'s
`serviceRoleKey()` shape) if it's absent or not valid JSON. Row added to
[`runbooks/README.md`](../../runbooks/README.md) for the owner to set it from
**Project Settings → API → JWT Keys**; `.env.example` documents the expected
shape.

Claims are exactly the Decisions table: `role`, `aud`, `iat`, `exp`,
`workspace_id`, `runtime_id` — **no `sub`**, verified by a test that decodes a
freshly minted token and asserts the claim is absent, not just unchecked.
`exp` is `DAEMON_REALTIME_TOKEN_TTL_S` (600s) ahead of `iat`, also asserted
directly rather than assumed from the constant being passed in correctly.

Both the lib and the route are new test surfaces for this repo:
`realtime-token.test.ts` generates a throwaway ES256 keypair per test (never
the project's real one) with `jose`'s `generateKeyPair`/`exportJWK`, and
`route.test.ts` is the first `/api/daemon/*` route test in this codebase —
every prior daemon route has only ever been verified live (curl against a
deployment) or through its calling code's own tests. Mocks `authenticateDaemon`
via `vi.mock("@web/lib/daemon/auth", ...)` to exercise the 401/403/200 paths
without a real token or database.

Added `jose@^6.2.10` to `apps/web/package.json` — no JWT library existed in
this repo before this task.

**Found and fixed while running the full suite, not scoped to this task**:
T-M16-01 added `SETTING_TERMINAL_ACCESS` to `DAEMON_SETTABLE_KEYS`, which
broke `runtime-routes.test.ts`'s sentinel assertion that the allowlist has
exactly 2 entries (its own comment: "asserts the shared constant they all
read has not quietly grown"). Updated to 3 and added the new key to the
`toContain` assertions rather than loosening the test.

**Not done here, and correctly so**: the live curl-against-a-deployment check
and the "Realtime actually accepts this token" proof both need
`SUPABASE_JWT_SIGNING_KEY` set on a real deployment, which is the owner
action above. `T-M16-06` §A is where that gets proved, once the owner has set
it — nothing else in this band is blocked on it in the meantime.
