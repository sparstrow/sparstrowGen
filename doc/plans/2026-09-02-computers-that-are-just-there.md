# Computers that are just there — 2026-09-02

| | |
|---|---|
| **Spec** | [`../specs/2026-09-02-computers-that-are-just-there.md`](../specs/2026-09-02-computers-that-are-just-there.md) |
| **Status** | Built and verified against staging 2026-09-02, all six phases — desktop auto-claim path still unproved ([`G-58`](../KnownGaps.md)) |
| **Trigger** | Owner, 2026-09-02, with three multica screenshots: connecting a computer should take no steps, the machine should stay reachable whenever the laptop is on, and one machine should serve personal and work workspaces with a switcher |
| **Depends on** | — (supersedes [`2026-08-31-browser-loopback-pairing`](2026-08-31-browser-loopback-pairing.md), whose loopback handshake is partly reused) |
| **Touches** | `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/`, `apps/web/src/lib/daemon/`, `apps/web/src/app/api/daemon/**`, `apps/web/src/app/machines/`, `apps/web/src/app/settings/`, `apps/web/src/lib/workspace.ts`, `apps/web/src/components/layout/`, `packages/core/src/cloud/`, `packages/core/src/cli/`, `packages/core/src/api/routes/system.ts`, `packages/desktop/src/` |
| **Tasks** | not decomposed — owner authorized building straight from this plan (2026-09-02) |
| **Open questions** | none |

## Summary

Move the machine credential from `{one workspace, one runtime}` to the person
who owns the machine, so a computer can be claimed automatically by whoever is
signed in on it and can serve every workspace that person belongs to. A new
`machines` table sits above the existing `runtimes` table — one runtime row per
`(machine, workspace)` — which leaves every existing dispatch path
(`runtime_commands`, terminals, chat turns, run events) pointing at exactly the
same workspace-scoped runtime id it points at today. On top of that: a workspace
switcher, a credentials page, an Add-a-computer dialog, and a daemon that
outlives the desktop window.

## What the spec asks for that isn't obvious

**"One machine, many workspaces" is a schema change, not a setting.**
`runtimes.workspace_id` is `NOT NULL` and every dispatch table hangs off
`runtime_id`. A machine that serves two workspaces cannot be one runtime row —
it has to be two, with something above them that says they are the same
computer. That "something" does not exist today, which is why the Machines page
can honestly say "machine" while the schema means "machine in one workspace".

**"It should find the device" cannot mean discovery.** There is no safe list of
unclaimed machines to discover: `/api/daemon/pair` is unauthenticated by
necessity (a machine with no credential has nothing to authenticate *with*), so
a listable queue of pending machines is a queue anyone on the internet can write
to. The spec resolves this by removing the thing to be discovered — the machine
claims itself using the identity of whoever is signed in on it. Discovery
becomes arrival.

**The standing rule in `daemon/auth.ts` has to be restated, not dropped.** Its
banner forbids reading a workspace id from a request body, because the daemon
API runs as service-role and a body-supplied id would simply be believed. A
person-scoped token *does* have to say which runtime it is acting for. The rule
survives in a stricter form: the request names a **runtime**, never a workspace;
the server loads that runtime row, verifies it belongs to this token's machine
**and** to a workspace this token's user is a member of, and derives the
workspace from the row. A body-supplied workspace id remains unreadable.

**Sign-in as a second person is a data-migration event.** FR-004 says the
machine transfers. The old owner's runtime rows for that machine must stop
existing, or their workspaces keep a machine entry that answers to someone else.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| `machines` + `access_tokens` tables, `runtimes.machine_id`, drop `daemon_tokens` | schema; nothing renders differently on its own |
| RLS policies for both new tables, and the widened `runtimes` read | the security boundary is invisible when it works |
| `authenticateMachine()` + `resolveRuntimeScope()` replacing `authenticateDaemon()` | an auth helper demos to nobody |
| Every `/api/daemon/*` route moved onto the `X-Sparstrow-Runtime` header | mechanical; behaviour unchanged from outside |
| Core's cloud client: store a PAT, claim the machine, register/heartbeat per workspace | the daemon side of the same boundary |
| `getActiveWorkspaceId` stops erroring on multiple memberships | strictly a precondition; the switcher is what the owner sees |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1** | Server action minting a token for the signed-in user; `sparstrow:claim-machine` IPC; core's authed `POST /system/cloud-token`; desktop claim-on-launch; "This device" badge | Install, sign in, the computer is listed. No terminal |
| **US2** | Detached core spawn, daemon prefs file, quit honouring `autoStopOnQuit`, IPC status surface, Settings → Daemon card | The machine stays reachable with the app closed, and says so when it isn't |
| **US3** | Workspace cookie + resolution, `WorkspaceSwitcher` in the app shell, claim registering across all memberships | Personal and work on one laptop, switched from any page |
| **US4** | `/settings` API Tokens card, list/create/revoke actions, one-time secret reveal | One page saying what has access, with Revoke |
| **US5** | `sparstrow setup` reusing the loopback handshake; Add a computer dialog with live arrival detection | A second machine, connected from its own terminal |
| **US6** | Manual token creation in the tokens card; `sparstrow setup --token` | A headless box, connected by pasted credential |

## Decisions

### A machine is a new row above runtimes, not a widened runtime

`machines` holds the person-owned identity (`user_id`, hostname, os, name) and
`runtimes` gains `machine_id` with `unique (machine_id, workspace_id)`.

The rejected alternative was making `runtimes.workspace_id` nullable and letting
one runtime row serve many workspaces. That would have pushed a workspace filter
into `runtime_commands`, `run_events`, terminal channels, and every RLS policy
that currently reads `workspace_id in (select private.current_workspace_ids())`
— rewriting the security boundary of the whole app to avoid one join. Keeping
runtimes workspace-scoped means **no dispatch code and no existing policy
changes at all**; a machine serving two workspaces simply has two runtime rows,
which is also what multica's own UI shows ("3 runtimes" nested under a machine).

`machines.id` is generated **on the machine** and persisted in its secrets dir,
not assigned by the server — the same property the current `runtimeId` has, and
for the same reason: it must survive a re-claim so the same computer does not
accumulate duplicate rows.

### The runtime is named in a header, never the workspace in a body

`X-Sparstrow-Runtime: <runtimeId>` on every `/api/daemon/*` request, resolved by
`resolveRuntimeScope()`, which fails closed unless the runtime's `machine_id`
matches the token's machine and the token's user is a member of that runtime's
workspace.

A header rather than the body because half these routes are `GET`s and the
alternative is a query parameter on some and a body field on others — two shapes
to keep correct instead of one. Workspace id is never accepted from the client
in any form; it is read off the verified runtime row.

### Tokens are person-scoped, non-expiring, and hashed

`access_tokens` stores `sha256` only, exactly as `daemon_tokens` did, and the
raw value is returned exactly once. Non-expiring is the owner's decision (spec
Assumption 3); the compensating controls are US4's list, `last_used_at`, and
immediate revocation — recorded in
[`SEC-2026-09-02-daemon-credential-widened-to-person-scope`](../security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md).

Rejected: 90-day expiry with silent renewal. An always-on machine that dies
quarterly, silently, is the exact failure US2 exists to remove.

### The loopback handshake is kept for US5, not rebuilt

`pairing_attempts` and the browser→loopback→server-side-exchange shape survive
from the superseded plan, with one change: `exchange_pairing_attempt` now mints
an `access_tokens` row for the **approving user** instead of a workspace-scoped
`daemon_tokens` row, and the confirm page no longer names a workspace.

This preserves the property that plan bought and that a naive rewrite would
lose: the real credential is minted **after** the browser's redirect has already
reached the machine's own listener, server-to-server. The alternative —
having the browser POST the token to loopback — puts the raw credential through
the browser for no gain.

### Desktop claims via a Server Action and one narrow IPC channel

The renderer is signed in; it calls a Server Action that mints a token, then
hands the secret to the main process over a single invoke-only channel, which
writes it into core's secret store through core's own authed local API. The
token never touches the renderer's storage and is never logged.

Rejected: having Electron main do the whole thing with its own Supabase client.
Main has no session — the session lives in the renderer's cookies — so it would
need to either scrape cookies out of the session partition or run a second auth
flow, both worse than passing one string across a bridge that already exists for
the folder picker and the updater.

### Active workspace is a validated cookie, not a URL parameter

`getActiveWorkspaceId` reads `sparstrow.workspace`, checks it against the
caller's memberships, and falls back to the first membership rather than
erroring. The existing `?workspaceId=` override is kept and now also writes the
cookie.

Rejected: putting the workspace in the route (`/w/<id>/machines`). That is the
better long-term shape and it rewrites every link, route and redirect in the app
— disproportionate to a plan whose subject is machines. Noted as a future
refactor rather than smuggled in here.

### Existing machines are disconnected once, not migrated

`daemon_tokens` is dropped. Each existing runtime is backfilled into its own
`machines` row so no dispatch history is orphaned, but every machine must be
re-claimed. Running both credential models across ~20 routes to save a handful
of re-claims doubles the trust surface during the transition — see spec
Assumption 5.

## Phases

### Phase A — the person-scoped boundary (foundational)

Schema, migration, RLS, `authenticateMachine`/`resolveRuntimeScope`, all
`/api/daemon/*` routes, and core's cloud client. Ends with typecheck and unit
tests green; nothing visibly different.

### Phase B — the computer claims itself (serves US1)

Token-minting action, IPC, core's `POST /system/cloud-token`, claim-on-launch,
"This device" badge in Machines.

### Phase C — workspaces on one machine (serves US3)

Workspace resolution, switcher in the app shell, claim registering into every
membership.

### Phase D — what has access (serves US4, US6)

Settings → API Tokens: list, create-by-hand with one-time reveal, revoke with
the this-computer confirmation.

### Phase E — always reachable (serves US2)

Detached spawn, prefs, quit behaviour, IPC status, Settings → Daemon card.

### Phase F — another computer (serves US5)

`sparstrow setup` over the retained loopback handshake, and the Add a computer
dialog with live arrival detection.

## Scope boundaries

- **No local-network discovery.** Spec Assumption 9.
- **No change to what a machine may do** — permissions and terminal access are
  [`2026-08-24-what-an-agent-is-allowed-to-do`](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md).
- **No OS-level service registration.** Scored and rejected in favour of a
  detached process the owner controls from Settings; available as later
  hardening.
- **No per-machine opt-in for workspaces the owner does not own** —
  [`D-30`](../Deferred.md), which must land before the first external
  membership exists.
- **No workspace-in-the-URL refactor** — see Decisions.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| SC-001 / SC-002 (zero-step claim) | Desktop dev run: sign in, observe the machine row appear with no other action |
| SC-003 (survives quit and restart) | Quit the app, confirm core still answers `/system/health` and the cloud row stays reachable |
| SC-004 (one page says what has access) | Open Settings → API Tokens with two tokens present |
| SC-005 (two workspaces reachable) | Create a second workspace, switch, confirm every page loads in both |
| SC-006 (revocation within one request) | Revoke, then watch the daemon's next call receive `revoked` and stop |
| SC-007 (four states, both modes) | Per-surface pass in light/dark on Paper and Mono |

**Known verification limits, named up front:** SC-003's "from a second device"
half and every multi-machine scenario in US5 need a second physical machine this
session does not have. What can be proved locally is that core survives the
app's exit and keeps answering; the cross-device half is a `KnownGaps.md` entry,
not a tick.

## Result

**All six phases built in one session, 2026-09-02**, on the owner's instruction
to go straight from plan to code without the spec review gate. Five commits on
`claude/multica-device-pairing-1f41b7`.

| Phase | Shipped |
|---|---|
| A — person-scoped boundary | `machines` + `access_tokens`, migrations 0011/0012, `policies/033`, `authenticateMachine`/`resolveRuntimeScope`, all 20 `/api/daemon/*` routes, core's client/claim/heartbeat/commands |
| B — the computer claims itself | token-minting action, `sparstrow:claim-machine` IPC, core's `POST /system/cloud-token`, `DesktopAutoClaim` |
| C — workspaces on one machine | cookie-based resolution, `GET /workspaces`, real switching in the sidebar |
| D — what has access | Settings → API Tokens, one-time reveal, revoke |
| E — always reachable | detached spawn, daemon prefs, quit honouring `autoStopOnQuit`, Settings → Daemon |
| F — another computer | Add-a-computer dialog, "This device" badge, `sparstrow setup --token` |

**Every story is code-complete, and the Verification table below was run against
staging** with the owner's explicit permission on 2026-09-02. `claim_machine`
and every policy in `033` executed for the first time; the credential boundary,
revocation, and one-machine-many-workspaces all behaved as designed. Staging was
returned to its prior state afterwards.

What is still unproved is the desktop auto-claim journey (renderer → IPC → core)
and a real daemon's heartbeat/command loops — see [`G-58`](../KnownGaps.md).

### What was found while VERIFYING that the plan didn't anticipate

**`delete_own_account()` was collateral damage, twice over.** Dropping
`pairing_attempts` broke it outright — it referenced that table, so every
account deletion threw. And it had never swept the credential tables, which was
harmless while a credential died with its workspace and a security hole the
moment credentials belonged to a person. Neither was visible from the plan, from
typecheck, or from 1,650 unit tests; both were obvious within a minute of
cleaning up after a real account. Filed as `SEC-2026-09-02`.

**The documented way to apply a migration does not work.** `drizzle-kit migrate`
cannot run against staging — its journal is empty while 42 tables exist, because
staging was built from `apply-to-supabase.sql`. `psql` is not installed either.
Both facts were invisible until someone tried. `G-60`.

### What was found while building that the plan didn't anticipate

**The plan under-described `runtimes` as "unchanged".** It is, structurally —
but every *caller* in core assumed one runtime existed. `register`, `beat` and
`poll` each had to become one-call-per-runtime, and the failure they now handle
(a runtime that vanished because the owner left a workspace) needed a new
`unknown_runtime` reason distinct from `revoked`, or a machine would treat
leaving a workspace as being cut off and stop.

**Two real security holes were in the first draft of `policies/033`,** both
found by re-reading it rather than by any test:

1. `access_tokens_owner_insert` validated `user_id` but not `machine_id`, so a
   member of a shared workspace could mint a token naming somebody else's
   machine and then impersonate that computer within the workspace they legitimately
   share.
2. `claim_machine` was documented as adopting a hand-made token's machine and
   never touched `access_tokens`, so US6's tokens would have named no machine
   forever.

**`drizzle-kit generate` cannot run without a TTY.** It prompts to disambiguate
drop-versus-rename, which a non-interactive shell cannot answer. Splitting the
change into an additive migration (0011) and a destructive one (0012) removes
the ambiguity entirely and is a better migration anyway — the backfill has
somewhere to live between the column being added and being tightened.

**The existing `WorkspaceSwitcher` was an account menu wearing a switcher's
name.** It showed the current workspace and offered no way to leave it, because
belonging to two was a hard 400. Worth knowing that a component named for a
capability is not evidence the capability exists.

### What it spawned

- [`G-58`](../KnownGaps.md) — the whole feature, unverified against a live database.
- [`G-59`](../KnownGaps.md) — the full suite flakes under parallel turbo; not
  proved to predate this work.
- [`G-60`](../KnownGaps.md) — staging's drizzle journal is empty, so
  `drizzle-kit migrate` cannot be used on it; `apply-pending.mjs` is the
  workaround.
- [`SEC-2026-09-02-deleted-account-kept-live-credentials`](../security/SEC-2026-09-02-deleted-account-kept-live-credentials.md)
  — found and fixed during verification: `delete_own_account()` never swept the
  credential tables, which only became a hole once credentials were
  person-scoped.
- [`D-30`](../Deferred.md) — a machine in someone else's workspace, which must
  land before the owner ever joins one.
- [`SEC-2026-09-02`](../security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md)
  — the accepted trust-boundary widening and its compensating controls.
- [`D-29`](../Deferred.md) closed — headless connection, via `sparstrow setup --token`.
