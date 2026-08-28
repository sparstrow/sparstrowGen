# BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls

**Status:** 🟢 resolved
**Reported by:** agent — investigating `G-48` (the malformed `SUPABASE_JWT_SIGNING_KEY`) with the owner, tracing how a fixed signing key would actually get used
**Reported:** 2026-08-27

## Symptom

Even with a correctly signed `SUPABASE_JWT_SIGNING_KEY`, the daemon's minted
Realtime credential cannot pass `018_terminal_channels.sql`'s RLS policies. A
paired machine would still fail to subscribe to its own control channel
(`machine:<ws>:<runtime>`) and fail to publish `reply`/`output` events — the
entire terminal feature's daemon-side data plane is unreachable, independent
of the signing-key problem `G-48` describes.

## Reproduction

Not reproduced live — no environment has ever had a valid signing key, so the
daemon side of M16/M17 has never actually connected. This is a static trace,
not an observed failure:

1. `apps/web/src/lib/daemon/realtime-token.ts`'s `mintRealtimeToken()` signs a
   token with claims `{ role: "authenticated", workspace_id, runtime_id, iat,
   exp }` — **deliberately no `sub`** (see its own doc comment: a nanoid `sub`
   would make `auth.uid()` raise inside `private.current_workspace_ids()`,
   which `010_transcript_broadcast.sql`/`015_chat_broadcast.sql` both call).
2. `packages/shared/drizzle/policies/018_terminal_channels.sql`'s four
   policies (`terminal_channel_admin_read`, `machine_channel_admin_read`,
   `terminal_channel_admin_send`, `machine_channel_admin_send`) each gate
   solely on:
   ```sql
   split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())
   ```
3. `private.current_admin_workspace_ids()` (`001_rls.sql`) is:
   ```sql
   select m.workspace_id from public.workspace_members m
   where m.user_id = (select auth.uid())::text
   ```
   `auth.uid()` is derived from the JWT's `sub` claim. With no `sub`, it is
   `NULL`, the query returns zero rows, and `in (select ...)` is false for
   every workspace — for all four policies, unconditionally.

So a daemon's own token, however it is signed, can `SELECT` nothing and
`INSERT` nothing on `realtime.messages` under the current policy set.

## Investigation

Confirmed by reading the three files above directly, not inferred. No RLS
policy anywhere in `packages/shared/drizzle/policies/` grants access based on
a token's own `workspace_id`/`runtime_id` claims — `current_admin_workspace_ids()`
is exclusively a `workspace_members` lookup, which requires a real `auth.uid()`,
which requires a real signed-in Supabase Auth user.

This was never exercised by any test, live or synthetic. `T-M16-06`'s §A ("the
wire works" — the daemon's own subscribe/publish) was attempted but never
completed (`G-47`); §D's live SQL-assertion pass tested only **browser**
admin/member synthetic sessions against the policies, never a daemon-shaped
token with no `sub`. The gap between what T-M16-02 minted and what T-M16-03's
policies actually check was never cross-checked.

This is **additional to `G-48`, not an alternative description of it**. `G-48`
is "we cannot produce a validly-signed token at all" (Supabase never exports
the ES256 private key for self-signing — confirmed live with the owner in the
dashboard, including a freshly created standby key). This bug is "even a
validly-signed token, with the claims this code currently mints, would still
be refused by RLS." Fixing `G-48` alone (e.g. routing token minting through
Supabase Auth itself, so Supabase signs it) does not fix this — the resulting
token needs a `sub` that resolves through `current_admin_workspace_ids()` (or
a new RLS path built for it), and today's claim shape has neither.

Any real fix has to resolve both:
1. Get Supabase itself to sign the token (`G-48`'s question).
2. Give the daemon's identity a way to pass (or be recognized by new policy
   logic added alongside) `018`'s admin-membership check, **without** making
   it an actual `workspace_members` row — `doc/tasks/M3/README.md` decision 1
   rejected exactly that ("Giving each runtime a real auth user would make it
   look like a member, which grants the whole workspace") for the `/api/v1`
   surface, and that reasoning applies here too: a real member row would also
   grant the daemon's identity read access to every other
   `current_workspace_ids()`-gated table (`machine_shared_locations`,
   `agent_machine_restrictions`, projects, runs, tasks, chat, memory notes —
   the entire product surface), not just its own two Realtime topics.

## Impact

Blocks US1–US3 of the terminal spec entirely (open a shell, resume a session,
agent terminals) — every scenario that requires the daemon to actually hold a
live Realtime connection. US4 (the per-machine off switch) is unaffected, since
it never requires the daemon to connect to Realtime at all. No terminal session
has ever run end-to-end in this project; by this analysis, none could have,
even before the signing key itself regressed. Affects `development` and every
Vercel preview today, and will affect `main` once M16/M17 promote there,
unless resolved first.

No workaround exists at the current design — this is not a config or
environment problem.

## Resolution

**Fixed by the `DI` band** (`doc/plans/2026-08-27-the-daemon-gets-a-real-identity.md`):
`019_daemon_realtime_identity.sql` gives each paired machine a real Supabase
Auth identity (never a `workspace_members` row — decision `DI-1`) plus
`private.current_daemon_scope()` and four `realtime.messages` policies scoped
to that identity's own `(workspace_id, runtime_id)` pair. `mintRealtimeToken()`
(`T-DI-03`) now obtains a real Supabase-signed session for that identity
instead of self-signing, which also closes `G-48`'s signing-key half.

**Verified live, 2026-08-28, `T-DI-05`, against `pnymngoqseltgigcfevq`
(sparstrowgen-staging) and a real paired daemon on `development.sparstrow.com`:**

- `018` (re-run), `019`, `020` applied; `pg_policies` shows the expected ten
  rows.
- The daemon's minted session JWT carries the correct `sub` (its
  `daemon_identities.user_id`), `role: authenticated`.
- A direct SQL simulation of `019`'s exact `using`/`with check` booleans, with
  `request.jwt.claim.sub` and `realtime.topic` set to the daemon's real
  values, evaluates `true` for its own `(workspace, runtime)` pair.
- The real daemon's Realtime connection reaches `SUBSCRIBED` on
  `machine:<ws>:<runtime>` with **no** `Unauthorized` refusal — the exact
  symptom this bug described is gone.

**This closes the RLS-refusal defect specifically, and only that.** A real
`terminal.list` round trip still does not complete — not because of this
policy set (verified correct above), but because of a separate, deeper
platform-level issue found in the same pass:
[`BUG-2026-08-28-private-broadcast-channels-not-relaying`](BUG-2026-08-28-private-broadcast-channels-not-relaying.md).
`T-DI-05` is blocked on that bug now, not on this one.
