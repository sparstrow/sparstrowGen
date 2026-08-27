# DI — the daemon gets a real identity

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-the-daemon-gets-a-real-identity.md`](../../plans/2026-08-27-the-daemon-gets-a-real-identity.md) |
| **Kind** | **foundational** — unblocks US1–US3, which M17 already built |
| **Spec** | [`../../specs/2026-08-24-a-terminal-on-my-machine.md`](../../specs/2026-08-24-a-terminal-on-my-machine.md) |
| **Depends on** | M16 and M17, both merged |
| **Blocks** | Band 24 (M22–M24) — see the queue note; its "blocked by M16" is really "blocked by M16 *working*" |
| **Status** | not started |
| **Open questions** | none |

## Objective

Make a paired machine able to authenticate to Supabase Realtime and pass its own
channel's RLS, so the terminal M16 and M17 built actually carries bytes.

Nothing here changes what the owner sees. Every surface, state, sentence and
acceptance scenario stays exactly as M17 shipped it.

## The two blockers this phase closes

Both were found on 2026-08-27, together, and each had been hiding the other.

**1. We cannot sign the daemon's token.**
[`DD-2`](../../plans/2026-08-24-a-terminal-on-my-machine.md) assumed the
project's ES256 private signing key could be read from the Supabase dashboard
and used by `mintRealtimeToken()`. Supabase never exposes the private half of an
asymmetric signing key — confirmed live in the owner's dashboard on both the
current key and a newly created standby key. Tracked as
[`G-48`](../../KnownGaps.md).

**2. Even a validly-signed token would be refused.**
`018_terminal_channels.sql`'s four policies gate solely on
`private.current_admin_workspace_ids()`, a `workspace_members` lookup keyed on
`auth.uid()`. `DD-2` deliberately mints **no `sub`**, so `auth.uid()` is null and
that lookup returns nothing — for all four policies, unconditionally. Tracked as
[`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md).

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-DI-01 — the session topic carries the runtime id](T-DI-01-session-topic-runtime-id.md) | `[S]` | foundational | — | done (2026-08-27) |
| [T-DI-02 — the daemon identity: schema, helper, policies](T-DI-02-daemon-identity-schema.md) | `[S]` | foundational | T-DI-01 | not started |
| [T-DI-03 — the token route mints a Supabase session](T-DI-03-token-route-supabase-session.md) | `[S]` | foundational | T-DI-02 | not started |
| [T-DI-04 — core adapts to the new credential](T-DI-04-core-credential-lifetime.md) | `[P]` | foundational | T-DI-03 | not started |
| [T-DI-05 — verification: the live pass that has never run](T-DI-05-verification.md) | `[S]` | US1–US3 | T-DI-01…04 | not started |

Every task through `T-DI-03` is `[S]`: each defines the contract the next one
compiles or authorizes against, and they touch overlapping files. `T-DI-04` is
`[P]` because it lives entirely in `packages/core` and needs only `T-DI-03`'s
response shape.

## Decisions already made

Plan decisions **DI-1** through **DI-5** govern this phase in full. Read them
there rather than here — the two that most often get re-litigated by someone
skimming:

- **The daemon identity is never a `workspace_members` row** (DI-1). That is
  what keeps [`M3`'s decision 1](../M3/README.md) intact rather than reversed.
- **No Custom Access Token Hook** (DI-1). A hook runs against every token the
  project mints; a mapping table read by one `SECURITY DEFINER` helper has a
  blast radius of one function.

## The shape of what was found

**Nothing in M16 or M17 needs rewriting.** The channel client, the terminal
manager, the four request kinds, the coalescer, the six refusal sentences, the
four emptinesses — all of it is built and unit-tested. This phase changes one
string shape, adds one table, one function and two policies, and rewrites one
module's internals. The surface area is small; it is the *seam* that was wrong.

**`018_terminal_channels.sql` stays, and its reasoning stays.** Its header
argues at length why a client may send `input`/`request` and may not send
`output`/`reply`. That argument is untouched. This phase adds the mirror-image
pair — the daemon may send `output`/`reply` and may not send `input`/`request` —
and moves two `split_part` indices for `DI-2`'s topic shape.

**The `sub` hazard `DD-2` was avoiding stops being a hazard.** A Supabase auth
user id is a uuid, so `auth.uid()`'s cast succeeds and
`current_workspace_ids()` returns empty rather than raising. `010` and `015`
already treat that as "not a member".

## Definition of done

- A real paired machine holds a subscribed control channel against a real
  preview deployment
- A `terminal.open` → type → see output round trip works in a browser on a
  different computer
- `T-M16-06` §A and §B pass, closing `G-47`
- `T-M17-06`'s interactive half passes, closing `G-48`'s first two clauses
- `BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls` is
  resolved with evidence
- `pnpm typecheck` and `pnpm test` green

**Not in this phase:** the orphaned `auth.users` sweep
([`I-14`](../../Ideas.md)), the Realtime dispatch doorbell
([`D-12`](../../Deferred.md)), and FR-009's live non-admin refusal, which needs
a second account and stays `G-48`'s.

## Verification

Full procedure in [T-DI-05](T-DI-05-verification.md). It is deliberately the
whole of `T-M16-06` §A/§B plus `T-M17-06`'s unreached half, re-run rather than
paraphrased — those checklists were written when the wire was expected to work,
and they are still the right checks.
