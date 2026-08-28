# T-DI-03 — the token route mints a Supabase session

| | |
|---|---|
| **Tag** | `[S]` — rewrites the module `T-DI-04` consumes the response of |
| **Serves** | **foundational** — closes the first of the phase's two blockers |
| **Depends on** | T-DI-02 |
| **Blocks** | T-DI-04, T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except the live checks (2026-08-27) — they need `T-DI-02`'s SQL applied |

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
`unique` on `public.daemon_identities` (`T-DI-02`), so this is an upsert, not a
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
goes through `public.daemon_identities` — but the flag marking a row as a
daemon belongs in `app_metadata` regardless, so that a future reader is not
tempted.

**Delete the self-signing path rather than leaving it dormant** (plan Scope
boundaries): `mintRealtimeToken`'s `jose` usage, the `SUPABASE_JWT_SIGNING_KEY`
read, its `.env.example` entry, and `turbo.json`'s declaration of it.

## Checklist

- [x] `apps/web/src/lib/daemon/realtime-token.ts` rewritten:
      resolve-or-create the identity, then `generateLink` → `verifyOtp`, then
      return `RealtimeCredential`
- [x] `expiresAt` comes from the session's own `expires_at`, not a constant —
      and a session arriving *without* one throws rather than shipping a
      credential the daemon has no refresh timer for.
      `DAEMON_REALTIME_TOKEN_TTL_S` is now unread by this module; `T-DI-04`
      owns retiring or re-documenting it, since core is its only other reader
- [x] Identity creation is idempotent under concurrency — the `unique` on
      `runtime_id` turns the race into a failed insert, which is caught,
      re-read, and resolved onto the winner's identity
- [x] The route's existing 401/403 behaviour is unchanged, and a failure to mint
      still returns 500 with nothing sensitive in the body — now asserted, not
      just preserved
- [x] **Nothing logs the access token, the refresh token, or the hashed OTP** —
      the module logs nothing at all; the route logs only `err.message` for a
      misconfiguration, as before
- [x] `jose` removed from `apps/web/package.json` — nothing else imported it
- [x] `SUPABASE_JWT_SIGNING_KEY` removed from `.env.example` and `turbo.json`,
      with a do-not-re-add note in the former
- [x] `realtime-token.test.ts` rewritten against a mocked admin client: 14
      cases, including identity reuse, the insert race, `app_metadata` vs
      `user_metadata`, and three distinct mint failures
- [x] `route.test.ts` rewritten — asserts 401 / 403 / 200, that a refused
      caller never reaches the mint, that the scope comes from the bearer token,
      and that a mint failure's detail does not reach the body
- [x] `pnpm --filter web typecheck` and tests green — 40 files / **451** passed

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

- [x] Unit tests as above, green — `realtime-token.test.ts` 14/14,
      `route.test.ts` 5/5, whole `apps/web` suite 451/451
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

**The three live items are blocked on `T-DI-02`'s SQL being applied**, not on
this code. They are left unticked rather than downgraded to "the unit tests
cover it": a mocked admin client proves the call sequence, and proves nothing
about whether Supabase accepts the resulting token or whether the policies
recognise the identity. `T-DI-05` §A is where they close.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] Update `doc/runbooks/README.md`'s `SUPABASE_JWT_SIGNING_KEY` row — the
      variable no longer exists, so the row becomes historical rather than
      blocked

## Result

**Found while implementing: `T-DI-02`'s table was in the wrong schema, and this
task is what surfaced it.** `019` originally created
`private.daemon_identities`, reasoning that `private` is where `001_rls.sql`
puts things only policies should read. That is right for a *function* and wrong
for a *table* something has to write: PostgREST only exposes configured schemas,
so `daemonDb().from("daemon_identities")` could never have reached it. Corrected
to `public.daemon_identities` **with RLS enabled and zero policies**, which is
equally closed — RLS with no policy denies every `anon`/`authenticated` caller,
and `service_role` bypasses RLS — while being reachable by the one client that
needs it. `019`, `020`, the plan and `T-DI-02` all updated; the reasoning is
recorded in `019`'s header so the next reader sees why `private` was rejected
rather than re-proposing it.

**The identity race is resolved by the database, not by a lock.** Two
simultaneous first requests from one machine both find no row and both create an
auth user; the `unique` constraint on `runtime_id` then fails one insert, which
is caught, re-read, and resolved onto the winner's identity. The loser's auth
user is orphaned and inert — the same end state as an unpaired machine, and
`I-14`'s territory. A `pg_advisory_xact_lock` like `bootstrap_workspace`'s would
have been the alternative; it is not worth it for a path that runs once per
machine ever, and the constraint is the stronger guarantee anyway.

**`.invalid` for the synthetic address, not a real domain.** RFC 2606 reserves
it precisely so it can never resolve, which matters more here than tidiness:
`generateLink` is documented not to send mail, but if that ever changes, an
address on a domain this project owns would start generating bounces against a
mailer that is already capped and org-only (`D-14`). A reserved domain fails
closed. The addresses are also deliberately legible in the dashboard's Auth →
Users list, where these rows do appear and where someone will eventually ask
what they are.

**A session with no `expires_at` throws** rather than returning a credential.
Core derives its refresh timer from that field alone (`T-M16-04`'s rule: never
decode the JWT), so a missing value would produce a connection that works and
then silently dies an hour later — the hardest possible failure to attribute.

**`DAEMON_REALTIME_TOKEN_TTL_S` is now unread by this module** but still
exported and still read by core. Deliberately left for `T-DI-04`, which owns
core's refresh logic and is the only place that can decide whether it becomes a
refresh floor or goes away — retiring it from here would have left core reading
a constant this task had already declared meaningless.

**Live verification is blocked on `T-DI-02`'s SQL**, which no agent in this
session can apply. Three checks stay unticked above and are inherited by
`T-DI-05` §A.
