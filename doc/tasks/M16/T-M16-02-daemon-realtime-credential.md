# T-M16-02 — daemon Realtime credential

| | |
|---|---|
| **Tag** | `[P]` — two new files under `apps/web`, shared with nothing else in this phase |
| **Serves** | **foundational** — the piece M5 named and declined; without it the daemon cannot receive a keystroke |
| **Depends on** | T-M16-01 |
| **Blocks** | T-M16-04, T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Establish which signing path this project uses; record the answer in this
      task's Result section — the next person must not have to look it up again
- [ ] `apps/web/src/lib/daemon/realtime-token.ts` — `mintRealtimeToken({ workspaceId, runtimeId })`,
      returning `{ token, expiresAt }`
- [ ] `apps/web/src/app/api/daemon/realtime/token/route.ts` — `POST`, bearer auth
      via the existing resolver, returns the minted credential
- [ ] The signing secret is read once, from a server-only env var, with a clear
      thrown error naming the variable if it is absent — the same shape
      `broadcast.ts`'s `serviceRoleKey()` uses
- [ ] Unit tests: claims are exactly as specified; **there is no `sub` claim**;
      `exp` is `DAEMON_REALTIME_TOKEN_TTL_S` ahead of `iat`; an absent secret
      throws by name
- [ ] Route tests: no token → 401; revoked pairing → 403; valid → 200 with a
      token that verifies against the signing key
- [ ] A row in [`../../runbooks/README.md`](../../runbooks/README.md) for the
      owner: set the signing variable on the Vercel project
- [ ] `apps/web` typecheck and tests green

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

- [ ] `pnpm --filter @sparstrow/web test` green including the new route tests
- [ ] `node -e` (or a test) decodes a freshly minted token and asserts the claim
      set matches the table above **and that `sub` is absent**
- [ ] Against a real deployment: `curl -XPOST .../api/daemon/realtime/token` with
      a valid daemon token returns 200; with a garbage token returns 401
- [ ] The minted token is accepted by Realtime — proved in
      [`T-M16-06`](T-M16-06-verification.md) §A, not here, because it needs the
      policies from `T-M16-03` to be applied first

## On completion

- [ ] Tick 20.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table
- [ ] Confirm the runbook row is present and accurate

## Result

*(filled in when the task lands — including which signing path this project
turned out to use)*
