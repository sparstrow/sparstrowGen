# The daemon gets a real identity — 2026-08-27

| | |
|---|---|
| **Spec** | [`2026-08-24-a-terminal-on-my-machine.md`](../specs/2026-08-24-a-terminal-on-my-machine.md) — no new spec; this delivers stories that spec already owns and the owner already reviewed |
| **Status** | Approved 2026-08-27 (owner chose this shape over a Next.js relay, in chat) |
| **Trigger** | The owner, 2026-08-27, walking the Supabase dashboard together while chasing `G-48`: Supabase will not export a signing key, so `DD-2`'s self-signing design cannot work — and tracing why turned up a second, independent blocker in the RLS |
| **Depends on** | M16 and M17, both merged. This replaces one decision inside M16 rather than adding a phase after it |
| **Touches** | `packages/shared/src/cloud.ts`, `packages/shared/drizzle/policies/{018,019,020}*.sql`, `apps/web/src/lib/daemon/realtime-token.ts`, `apps/web/src/app/api/daemon/realtime/token/route.ts`, `apps/web/src/lib/terminal-channel.ts`, `packages/core/src/cloud/{realtime,terminal-bridge}.ts` |
| **Tasks** | [`doc/tasks/DI/`](../tasks/DI/README.md) |
| **Open questions** | none |

## Summary

Serves [the terminal spec](../specs/2026-08-24-a-terminal-on-my-machine.md) —
specifically US1, US2 and US3, which M16 and M17 built and which have never
once worked. This plan replaces
[`DD-2`](2026-08-24-a-terminal-on-my-machine.md)'s "mint and sign our own JWT"
with **"ask Supabase to mint one, for an identity that owns exactly one
machine"**: a dedicated Supabase Auth user per paired runtime, deliberately not
a workspace member, recognised by a new pair of `realtime.messages` policies
through a mapping table rather than through membership.

No user-visible behaviour changes. Every acceptance scenario in the spec stays
exactly as written — this is the transport underneath them finally becoming
able to carry a byte.

## What the spec asks for that isn't obvious

Nothing new from the spec. What is not obvious is in the **existing plan**, and
it is worth stating plainly because it is the reason this document exists.

**`DD-2` is unbuildable as written, and its own safety argument was what hid
the second failure.** `DD-2`'s fourth bullet — "**No `sub` claim,
deliberately**" — is correct about the hazard it names: a nanoid in `sub` would
make `auth.uid()` raise on its `uuid` cast inside
`private.current_workspace_ids()`, breaking run transcripts and chat for
everything on that connection. That reasoning is sound and is preserved here.
But omitting `sub` also means `auth.uid()` is null, and
`018_terminal_channels.sql`'s four policies gate **solely** on
`private.current_admin_workspace_ids()`, which is a `workspace_members` lookup
keyed on `auth.uid()`. So the daemon's own token could never have passed its
own channel's RLS, however it was signed —
[`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md).

Two independent blockers, and each one hid the other: nobody could get far
enough past the signing problem to hit the RLS problem. `T-M16-06` §A, the one
check that would have caught it, is the one check that has never run (`G-47`).

## Work breakdown

Everything here is foundational. The stories it unblocks (US1, US2, US3) were
already built by M17 and need no further UI work — that is the whole point of
the split, and it is why this plan has no per-story rows.

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| Session topics carry the runtime id | A string shape in `@sparstrow/shared`; changes nothing the owner sees |
| `public.daemon_identities` + `private.current_daemon_scope()` | A mapping table and a lookup function, invisible above the RLS layer |
| Two new `realtime.messages` policies for the daemon | Authorization; demos to nobody |
| Token minting via Supabase's own Auth instead of self-signing | Same endpoint, same response shape, different provenance |
| Core adapting to a Supabase-issued credential's lifetime | A refresh timer |

### Per story

| Story | Work | Delivers |
|---|---|---|
| US1, US2, US3 | none — M17 already built the surfaces | They start working, for the first time, when the foundational work lands |

## Decisions

### DI-1 — The daemon gets a real Supabase Auth identity, and is deliberately not a workspace member

**This supersedes [`DD-2`](2026-08-24-a-terminal-on-my-machine.md) in full.**
Supabase never exposes the private half of an asymmetric signing key — confirmed
2026-08-27 in the owner's own dashboard, on both the current ES256 key and a
freshly created standby key, neither of which offered any export or one-time
reveal. Self-signing is therefore not a thing this project can do at all, and no
amount of correcting the env var changes that. The only way to hold a token
Supabase's Realtime will accept is for Supabase to have signed it, which means
the daemon needs an identity Supabase knows about.

**[`M3`'s decision 1](../tasks/M3/README.md) rejected exactly this, and its
reasoning is respected rather than overridden.** That decision's objection is
specific: *"Giving each runtime a real auth user would make it look like a
member, which grants the whole workspace."* True — **if the identity is inserted
into `workspace_members`.** This one never is. With no membership row,
`private.current_workspace_ids()` returns nothing for it, so every table policy
M1 wrote denies it exactly as it denies an anonymous caller; `010` and `015`
deny it on transcripts and chat for the same reason. It is an identity with zero
inherited privilege, granted access only through the two new policies in `DI-3`,
which name its own machine's two topics and nothing else. The alternative
considered and rejected was a **Custom Access Token Hook** injecting
`workspace_id`/`runtime_id` claims: it works, but a hook runs against *every*
token the project mints, so a scoping mistake in it is a claim-injection bug on
ordinary human sessions. A mapping table read by a `SECURITY DEFINER` helper
achieves the same result with a blast radius bounded by one function.

**A pleasant consequence: `DD-2`'s `sub` hazard disappears rather than being
worked around.** A Supabase auth user id *is* a uuid, so `auth.uid()`'s cast
succeeds, and `current_workspace_ids()` returns empty — the "not a member"
answer those policies already handle — instead of raising.

### DI-2 — The session topic carries the runtime id

`terminalSessionTopic(workspaceId, sessionId)` becomes
`terminalSessionTopic(workspaceId, runtimeId, sessionId)`, so
`terminal:<ws>:<session>` becomes `terminal:<ws>:<runtime>:<session>`.

Without this, the daemon's `output` policy can only check *"is the sender a
daemon in this workspace"* — because session ids are machine-local and
[`D-26`](../Deferred.md) means no cloud row exists to join against. That would
let one of the owner's machines publish output onto another of its machines'
session topics. Not a catastrophe, and symmetric with what an admin browser can
already do, but it is avoidable for the cost of one string change while nothing
is live: **zero sessions exist in any environment today**, so there is no
migration and no compatibility window. Doing it later, once real sessions
exist, would need both shapes supported at once.

The workspace id stays first for the reason `DD-3` gives — it keeps the browser
policies a membership test with no join.

### DI-3 — Revocation is enforced by the lookup, not by deleting the identity

`private.current_daemon_scope()` resolves the caller through
`daemon_identities` **joined to a live `daemon_tokens` row** (`revoked_at is
null`). So revoking a pairing cuts Realtime access on the next policy
evaluation, with no second cleanup path to forget — and removing a machine
cascades the mapping row away through the existing `runtimes` FK.

The `auth.users` row is deliberately left behind, inert: it has no membership,
no `public.users` row, and after either operation no `daemon_identities` row, so
it can reach nothing. Deleting it would need the Auth admin API from a Server
Action that today runs as the *caller's* RLS-scoped client, which would mean
widening the service role's blast radius past `/api/daemon/*` — a boundary
[`auth.ts`](../../apps/web/src/lib/daemon/auth.ts) states explicitly and this
plan will not quietly relax. Orphan accumulation is 1:1 with unpaired machines,
which is low volume; a sweep is named in Scope boundaries rather than built.

### DI-4 — The identity is created lazily, on first token request, not at pairing

The token route already authenticates the daemon and already holds the service
role, so it can create the identity on first use and reuse it thereafter. Doing
it there rather than in `/api/daemon/pair` is what makes **every machine paired
before this ships** work with no migration and no owner action — they simply
get an identity the next time they ask for a credential. It also keeps
`redeem_pairing_code`'s single-transaction guarantee untouched, which a
pairing-time Auth API call would have straddled.

### DI-5 — `bootstrap_workspace` must refuse a daemon identity

A daemon's access token is a real `authenticated` JWT, so it can reach
PostgREST. Everything there denies it for lack of membership — except
[`bootstrap_workspace`](../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql),
which is `SECURITY DEFINER` and exists precisely to give a member-less caller a
workspace. Left alone, a leaked daemon token could mint junk workspaces, and
`getActiveWorkspaceId` would then find one. One guard clause, closed in the same
change that creates the identities rather than filed as a follow-up.

## Phases

Single phase. The work is one coherent change to one seam, and splitting it
would produce a phase that cannot be verified on its own.

### DI — the daemon gets a real identity (foundational)

Delivers a paired machine that can hold its own control channel and publish on
its own session topics, and therefore US1/US2/US3 working end to end for the
first time. Depends on M16 and M17, both merged. Done when `T-M16-06` §A/§B and
`T-M17-06`'s interactive scenarios — the checks `G-47` and `G-48` hold open —
actually pass against a real preview with a real paired machine.

## Scope boundaries

- **No user-facing behaviour changes.** Every FR and SC in the terminal spec
  keeps its existing wording; this plan adds none and changes none.
- **The orphaned `auth.users` sweep is not built** — `DI-3`. Filed as
  [`I-14`](../Ideas.md) rather than `Deferred.md`, because nothing yet says it
  needs doing at all: it becomes real work only if unpair/re-pair volume ever
  makes the orphan count matter.
- **`SUPABASE_JWT_SIGNING_KEY`, `jose`, and `mintRealtimeToken`'s signing path
  are deleted, not left dormant.** A dead self-signing path that still reads an
  env var is exactly the thing a future agent restores by accident.
- **No second Supabase project, no auth model change for humans.** Browser
  sessions, `018`'s admin policies, and every existing table policy are
  untouched except where `DI-2`'s topic shape forces a `split_part` index to
  move.
- **Not the Realtime dispatch doorbell** ([`D-12`](../Deferred.md)). This makes
  a daemon able to hold a channel, which is D-12's stated blocker, but spending
  that on dispatch is a separate decision with its own trade-off.

## Verification

The bar is the terminal spec's own criteria, and the honest starting position
is that **not one of the interactive ones has ever been checked** — every
"verified" claim M16 and M17 carry is either a unit test or a state reachable
without the control channel authenticating.

| Spec criterion | How it gets checked |
|---|---|
| SC-001 (echo latency, as a number) | `T-DI-05`, in a browser against a real paired machine — the first time this is measurable at all |
| SC-002 (output arrives progressively) | `T-DI-05`, a 10-second printing command arriving in more than one message |
| SC-003 (session survives a closed tab) | `T-DI-05`, reopened in a second browser |
| SC-005 (machine off reads correctly) | Already proved live in `T-M17-06`; re-checked for regression only |
| SC-007 (the machine refuses when switched off) | `T-DI-05`, now reachable because the request actually arrives |
| `T-M16-06` §A, §B | `T-DI-05` — these are `G-47`'s open items, inherited wholesale |
| `T-M17-06`'s interactive half | `T-DI-05` — `G-48`'s open items, inherited wholesale |
| FR-009's live non-admin refusal | **Not reachable without a second account.** Stays open, and stays `G-48`'s, rather than being quietly folded into this plan's success |

**Named up front, per `doc/README.md`:** if `T-DI-05` cannot get a real paired
machine against a real preview, this plan lands with the same shape of gap
`G-47`/`G-48` already record, and says so — it does not grade itself on the
unit tests.

## Result

*(filled in as the phase lands)*
