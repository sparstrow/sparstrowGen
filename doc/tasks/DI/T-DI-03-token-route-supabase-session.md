# T-DI-03 — the token route mints a Supabase session

| | |
|---|---|
| **Tag** | `[S]` — rewrites the module `T-DI-04` consumes the response of |
| **Serves** | **foundational** — closes the first of the phase's two blockers |
| **Depends on** | T-DI-02 |
| **Blocks** | T-DI-04, T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

> **Load the `supabase` skill before writing this** — `AGENTS.md` §3.12. This
> task uses the Auth admin API, whose method surface has changed between
> versions; verify `generateLink` / `verifyOtp` against current docs rather than
> from memory.

## Objective

Replace self-signing with Supabase-signing. `POST /api/daemon/realtime/token`
keeps its shape — same bearer auth, same `RealtimeCredential` response — and
internally obtains a real Supabase session for the machine's own identity,
creating that identity on first use.

## Decisions already made

Plan **DI-1**, **DI-3** and **DI-4** govern this task.

**Lazy create-or-reuse, in this route, not at pairing** (DI-4). Every machine
paired before this ships gets an identity the next time it asks for a
credential — no migration, no owner action, no backfill script. `runtime_id` is
`unique` on `private.daemon_identities` (`T-DI-02`), so this is an upsert, not a
check-then-insert race.

**A session, obtained without a stored password.**
`admin.generateLink({ type: 'magiclink', email })` returns
`properties.hashed_token` and — confirmed against current docs, 2026-08-27 —
**does not send an email**; it exists to hand the link to a custom provider.
`auth.verifyOtp({ token_hash, type: 'magiclink' })` then returns a real session.
Two admin calls, no secret at rest.

The alternative rejected: storing a generated password on the identity row and
calling `signInWithPassword`. It works, and it means a reusable plaintext
credential sitting in a table forever — strictly worse than a token that exists
for the duration of one request.

**The synthetic email is unmistakably synthetic and never receives mail.**
Something of the shape `daemon+<runtimeId>@<a domain this project controls and
does not serve mail on>`. It must not collide with a real user's address, and it
must be obvious in the Supabase dashboard's Auth → Users list what it is,
because these rows will appear there and someone will eventually wonder.

**`email_confirm: true` at creation.** Confirmation is ON for this project
(`runbooks/README.md`) and the built-in mailer is capped and org-only
(`D-14`) — an unconfirmed daemon identity would be an identity that can never
sign in, waiting on mail that will never arrive.

**`app_metadata`, never `user_metadata`.** The supabase skill's security
checklist is explicit: `user_metadata` is user-editable and unsafe for any
authorization decision. Nothing here should *need* to read it — authorization
goes through `private.daemon_identities` — but the flag marking a row as a
daemon belongs in `app_metadata` regardless, so that a future reader is not
tempted.

**Delete the self-signing path rather than leaving it dormant** (plan Scope
boundaries): `mintRealtimeToken`'s `jose` usage, the `SUPABASE_JWT_SIGNING_KEY`
read, its `.env.example` entry, and `turbo.json`'s declaration of it.

## Checklist

- [ ] `apps/web/src/lib/daemon/realtime-token.ts` rewritten:
      resolve-or-create the identity, then `generateLink` → `verifyOtp`, then
      return `RealtimeCredential`
- [ ] `expiresAt` comes from the session's own `expires_at`, not a constant —
      Supabase decides this TTL now, and `DAEMON_REALTIME_TOKEN_TTL_S` no longer
      describes reality. Retire the constant or re-document it as core's refresh
      *floor*; do not leave it claiming to be the token's life
- [ ] Identity creation is idempotent under concurrency — two simultaneous first
      requests from one machine must not create two auth users
- [ ] The route's existing 401/403 behaviour is unchanged, and a failure to mint
      still returns 500 with nothing sensitive in the body
- [ ] **Nothing logs the access token, the refresh token, or the hashed OTP** —
      `T-M16-02`'s trap, still true and now with three things to not log
      instead of one
- [ ] `jose` removed from `apps/web/package.json` if nothing else uses it
- [ ] `SUPABASE_JWT_SIGNING_KEY` removed from `.env.example` and `turbo.json`
- [ ] `realtime-token.test.ts` rewritten against a mocked admin client:
      identity created on first call, reused on second, `verifyOtp` failure
      surfaces as an error rather than a malformed credential, and a revoked
      pairing never reaches the mint at all
- [ ] `route.test.ts` still asserts 401 / 403 / 200
- [ ] `pnpm --filter web typecheck` and tests green

## Traps

**A daemon's access token is a real `authenticated` JWT and can reach
PostgREST.** `T-DI-02`'s `bootstrap_workspace` guard is what stops it minting a
junk workspace; if that guard is not in place, do not land this task — the two
belong to one change even though they are two files.

**`verifyOtp` creates a session row every time it is called.** With core
refreshing on a timer, `auth.sessions` grows per machine per refresh interval.
Check whether the project's session timebox / inactivity settings already reap
these; if they do not, say so in the Result and open a `KnownGaps.md` entry
rather than assuming it is fine. This is the kind of thing that is invisible for
a month and then is not.

**`generateLink` does not send mail — verify that is still true** before
relying on it. If a future Supabase version changes it, this route starts
generating capped, bouncing email on every refresh, and `D-14`'s mailer limits
mean the failure would surface as *other* mail silently not arriving.

**Do not reach for the service role in `apps/web` outside `lib/daemon/`.**
`auth.ts`'s banner states that boundary; this task stays inside it, and
`daemonDb()` is already exported there for exactly this kind of use.

**The response shape is a contract with core.** `T-M16-02`'s amendment added
`supabaseUrl` and `supabaseAnonKey` to `RealtimeCredential` because core has no
Supabase configuration of its own. Both are still required. Removing them
because "the token is different now" would break `T-DI-04` at runtime, not at
typecheck, if the type is widened carelessly.

## Verification

- [ ] Unit tests as above, green
- [ ] Against a real preview: `POST /api/daemon/realtime/token` with a real
      daemon bearer token returns a credential whose token **decodes to a real
      `sub`**, `role: "authenticated"`, and an `exp` in the future
- [ ] That same token, presented to PostgREST, reads **nothing** — no runtimes,
      no projects, no chat, no memory notes — and `bootstrap_workspace` refuses
      it. This is the check that proves DI-1's "zero inherited privilege" claim
      rather than asserting it
- [ ] A revoked pairing gets 403 from this route and, if it already holds a
      token, is refused by `current_daemon_scope()` at the RLS layer — both
      halves, since they are different mechanisms

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table
- [ ] Update `doc/runbooks/README.md`'s `SUPABASE_JWT_SIGNING_KEY` row — the
      variable no longer exists, so the row becomes historical rather than
      blocked

## Result

*(filled in when the task lands)*
