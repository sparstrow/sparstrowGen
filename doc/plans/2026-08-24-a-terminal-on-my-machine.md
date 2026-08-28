# A terminal on my machine — 2026-08-24

| | |
|---|---|
| **Spec** | [`../specs/2026-08-24-a-terminal-on-my-machine.md`](../specs/2026-08-24-a-terminal-on-my-machine.md) (Draft; the four framing decisions were taken by the owner 2026-08-24 and planning authorized in the same turn) |
| **Status** | ⚠️ Built, never working — M16 and M17 both merged; the wire has never carried a byte. **`DD-2` is superseded** by [`2026-08-27-the-daemon-gets-a-real-identity`](2026-08-27-the-daemon-gets-a-real-identity.md), which fixes both blockers (see the note under `DD-2`). Gaps: [`G-47`](../KnownGaps.md), [`G-48`](../KnownGaps.md), [`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md) |
| **Trigger** | The owner, 2026-08-24: "lets build the terminal." |
| **Depends on** | M3 (pairing + daemon token), M4 (per-machine settings via `settings.set`), M5 (the Realtime broadcast pattern this extends). All code-complete. |
| **Touches** | `packages/shared/src/cloud.ts`, `packages/shared/src/schemas/terminal.ts` (new), `packages/shared/drizzle/policies/018_terminal_channels.sql` (new), `apps/web/src/app/api/daemon/realtime/token/route.ts` (new), `apps/web/src/lib/daemon/realtime-token.ts` (new), `apps/web/src/lib/terminal-channel.ts` (new), `apps/web/src/app/terminals/terminals.tsx`, `apps/web/src/app/machines/machines.tsx`, `apps/web/src/content/knowledge/*.md`, `packages/core/src/cloud/realtime.ts` (new), `packages/core/src/cloud/terminal-bridge.ts` (new), `packages/core/src/terminal/manager.ts`, `packages/core/src/api/routes/terminal.ts`, `packages/core/src/index.ts` |
| **Tasks** | [`doc/tasks/M16/`](../tasks/M16/README.md), [`doc/tasks/M17/`](../tasks/M17/README.md) |
| **Open questions** | none |

## Summary

Serves [the terminal spec](../specs/2026-08-24-a-terminal-on-my-machine.md).
The machine's terminal is already built and working —
[`packages/core/src/terminal/manager.ts`](../../packages/core/src/terminal/manager.ts)
runs real `node-pty` sessions with a replay ring buffer, and
[`apps/web/src/app/terminals/terminals.tsx`](../../apps/web/src/app/terminals/terminals.tsx)
is a complete `xterm` client. **This plan builds the wire between them**: a pair
of private Supabase Realtime broadcast channels that both the browser and the
daemon connect *outward* to, plus the daemon-side Realtime credential that M5
explicitly declined to build.

That credential is the load-bearing piece and the reason this is two phases. M16
gives a machine a way to be *asked a question and answer it live* — a primitive
nothing in this app has ever had. M17 spends it on a terminal.

## What the spec asks for that isn't obvious

**1. "The hard part is already built" is true, and it hides where the work
actually is.** The dead page is dead for one reason —
[`terminals.tsx:168`](../../apps/web/src/app/terminals/terminals.tsx:168) dials
`window.location.host`, which used to be the daemon serving the UI and is now
Vercel. It is tempting to read that as a one-line fix. It is not: Vercel does
not serve WebSockets from route handlers, which
[`realtime-live-events.ts`](../../apps/web/src/lib/realtime-live-events.ts)
already records as the reason `wsHub` was replaced. There is no host in this
architecture that can hold a socket for both ends, so the transport has to be
one neither end hosts.

**2. The daemon has never authenticated to Realtime, and every prior phase
routed around it.** M4 polls rather than subscribing; M5 and M12 have the daemon
POST to a Next route that broadcasts with the service role, because that route
"already holds the service role and has already resolved the workspace from the
bearer token." Both files name the missing piece precisely —
[`010_transcript_broadcast.sql`](../../packages/shared/drizzle/policies/010_transcript_broadcast.sql):
*"a custom runtime_id JWT, a minting endpoint, a refresh timer, and policies
below that understand two kinds of principal."* A terminal cannot route around
it, because the daemon must **receive** keystrokes with no poll in between. DD-2
builds exactly those four things and nothing more.

**3. "Survives until closed" is a bigger change than it reads like.** The
machine currently kills a detached session after ten minutes
([`manager.ts:7`](../../packages/core/src/terminal/manager.ts:7)). Removing that
does not just extend a timer — it removes the thing that was silently bounding
how many `node-pty` processes a machine can accumulate. FR-005 (list everything
that is live) and FR-012 (a ceiling) are not extra polish; they are what replaces
the timer as the bound. DD-7.

**4. "Owner/admin only" has no existing enforcement point on a broadcast
channel.** `private.current_admin_workspace_ids()` exists in
[`001_rls.sql:60`](../../packages/shared/drizzle/policies/001_rls.sql:60) and is
used for table policies. Nothing has ever role-gated a *channel*. DD-4.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| Channel topics, event names, message envelopes and Zod schemas in `@sparstrow/shared` | A shared type file; serves every story equally and demos to nobody |
| `POST /api/daemon/realtime/token` — mint a short-lived, workspace-scoped Realtime credential for a paired machine | An endpoint no browser calls |
| `018_terminal_channels.sql` — subscribe **and** send policies on `realtime.messages`, admin-scoped, event-pinned | A policy. Its absence is invisible until someone else's tab can type into your shell |
| Core: `cloud/realtime.ts` — hold the connection, refresh the credential, reconnect with backoff, subscribe to the machine's control channel | Daemon plumbing; the owner sees only its effects |
| Core: `terminal/manager.ts` gains a sink abstraction, loses the detach timer, gains a session ceiling and output coalescing | The same terminal it already was, reachable by a second path |
| Core: `cloud/terminal-bridge.ts` — bind the control channel's requests to the manager, and a session's bytes to its channel | The seam between the two above |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1 — a shell from a browser** | `lib/terminal-channel.ts` (subscribe, send, request/response); `terminals.tsx` rewritten against it; the machine's name; all four states including the four distinct emptinesses | The owner presses Shell from any browser and gets a prompt on their machine |
| **US2 — come back to a session** | Session list sourced from the machine rather than from this tab; reattach with ring replay; the four distinct end-reasons | The owner closes the tab, comes back, and their session is still running |
| **US3 — agent terminals** | The interactive-spawn path end to end; agent picker filtered to providers with an interactive mode | The owner drops straight into an agent's CLI on their machine |
| **US4 — turn it off per machine** | `SETTING_TERMINAL_ACCESS` joins `DAEMON_SETTABLE_KEYS`; a toggle on the Machines card beside the WIP-snapshot one; daemon-side enforcement that kills live sessions | The owner takes the grant back without unpairing |

## Decisions

### DD-1 — The transport is a private Realtime broadcast channel, with both ends connecting outward to it

Chosen by the owner on 2026-08-24 over three alternatives, each rejected for a
specific reason rather than on taste. **Our own relay service** would be a fourth
deployed component with its own bill, pipeline, secrets and uptime,
reimplementing authentication Supabase already provides — correct later if live
surfaces multiply, over-engineering (§9) for one feature today. **The existing
command spine** polls every 3 s
([`COMMAND_POLL_INTERVAL_MS`](../../packages/shared/src/cloud.ts)), which cannot
meet SC-001's 200 ms and would make a Postgres table into a byte pipe. **A direct
browser→daemon socket** cannot be opened from an `https` page without a
certificate and a reachable address per machine, and reverses core's deliberate
`cors: { origin: false }` posture — the one decision here that is hard to walk
back. [`I-1`](../Ideas.md) already parks it as an optimization layered on a cloud
path, never the primary one.

The cost the owner accepted: Realtime bills per message, so coalescing is not
optional (DD-8).

### DD-2 — The daemon gets its own short-lived, workspace-scoped Realtime credential

> ⚠️ **SUPERSEDED 2026-08-27 by
> [`DI-1`](2026-08-27-the-daemon-gets-a-real-identity.md).** Kept in place
> because two of its four bullets are still exactly right, and because the
> fourth is the reason a second failure went unnoticed for two weeks.
>
> **What was wrong:** the signing key. This decision assumed the project's
> private signing key could be read from the Supabase dashboard. It cannot —
> Supabase never exposes the private half of an asymmetric key, confirmed live
> in the owner's own dashboard on both the current ES256 key and a freshly
> created standby one. There was never a value to put in
> `SUPABASE_JWT_SIGNING_KEY`.
>
> **What was subtly wrong:** the fourth bullet's conclusion, not its reasoning.
> Omitting `sub` does avoid the `uuid`-cast hazard it names — but it also makes
> `auth.uid()` null, and `018_terminal_channels.sql`'s four policies resolve the
> caller through `workspace_members` keyed on exactly that. So the daemon's own
> token could never have passed its own channel's RLS, however it was signed.
> The hazard was real; the fix traded it for a bigger one.
>
> `DI-1` resolves both at once: a real Supabase Auth identity per runtime, never
> a workspace member, recognised by new policies through a mapping table. A
> Supabase user id *is* a uuid, so the cast hazard disappears rather than being
> worked around.

This is the piece M5 named and declined. It is four things:

- **`POST /api/daemon/realtime/token`**, authenticated by the existing daemon
  bearer token through the same resolver every other `/api/daemon/*` route uses.
  Returns `{ token, expiresAt }`.
- **A ten-minute TTL**, refreshed by core at 80% of its life. Short because the
  blast radius of a leaked one is "can subscribe to this workspace's terminal
  channels", and short is the cheapest containment available.
- **Claims:** `role: "authenticated"`, `aud: "authenticated"`, `exp`, `iat`, and
  the custom `workspace_id` and `runtime_id`.
- **No `sub` claim, deliberately.** `auth.uid()` casts `sub` to `uuid`; a runtime
  id is a nanoid. A daemon token carrying one would make
  `private.current_workspace_ids()` **raise on the cast rather than return
  false**, and both `010` and `015` call it — so one badly-shaped daemon token
  would break run transcripts and chat for everything on that connection, not
  just fail closed for terminals. Omitting `sub` leaves `auth.uid()` null, which
  those policies already treat as "not a member".

The signing key is determined at implementation, not guessed here: projects
created before Supabase's asymmetric-JWT rollout have a shared secret, later ones
have a signing keypair and no shared secret. `T-M16-02` establishes which this
project has and implements the matching path; both are specified in that task.

### DD-3 — Two kinds of topic, not one

| Topic | Carries | Who sends |
|---|---|---|
| `machine:<workspace_id>:<runtime_id>` | Control: open, list, close, and the machine's answers. Request/response, correlated by a request id | Browser (requests), daemon (replies) |
| `terminal:<workspace_id>:<session_id>` | One session's bytes and resizes, both directions | Both |

Splitting them is not tidiness. A session's output is high-volume; putting it on
the machine channel would deliver every session's bytes to every tab that has
Terminals open, including tabs watching a different session. Per-session topics
let a tab subscribe to exactly what it is looking at and unsubscribe cleanly when
it looks away.

The workspace id is in both topics for the same reason it is in
`run:<workspace_id>:<run_id>` — it makes the policy a membership test with no
join. As `010`'s header says, the id in the topic is not what grants access; the
policy is.

### DD-4 — The browser sends on these channels directly, and `010`/`015` are not relaxed

Every other broadcast channel in this app is server-send-only, and
[`010`](../../packages/shared/drizzle/policies/010_transcript_broadcast.sql)
says in as many words: *"If you are adding an insert policy here, stop."* That
instruction is kept — it is about transcript and chat topics, and its stated
reason is that the browser merges broadcast events into the same list as fetched
ones, so a forged event is indistinguishable from a real one.

`017` is a **third policy file with a narrower grant**, not an edit to either:

- **Send** is granted only for topics beginning `terminal:` or `machine:`, only
  to `private.current_admin_workspace_ids()`, and only for the input and request
  event names. Output and reply events remain unforgeable by a client.
- **Subscribe** is granted on the same two topic families to the same admin set.

What a client could forge under this policy is *input to a shell on a machine
where they are already entitled to open their own shell*. That is not a
privilege escalation; it is the privilege they already hold, exercised through a
different message. The alternative — POST to a Next route that broadcasts with
the service role — spends a Vercel round trip inside a 200 ms budget and buys no
containment at all.

### DD-5 — No cloud table. The machine is the source of truth for its own processes

A terminal session is a process. A mirror row in Postgres can disagree with
reality the instant the machine restarts, and then the app is showing a list of
shells that do not exist. Listing sessions is *asking the machine a question*,
which is the primitive M16 exists to build — so the list comes from the machine,
every time, and is correct by construction.

This also removes a migration, an RLS policy, and a cleanup story from the plan.

What it costs is a cloud record of who opened a shell and when. That is worth
having with more than one member and is parked as [`D-26`](../Deferred.md) with
that as its unpark trigger; today the record is the machine's own log.

The same decision answers "how does the page know the machine restarted": the
daemon's reply to a request for an unknown session carries its own start time, so
the page can say *the machine restarted at 09:14* rather than infer it. No new
column on `runtimes`.

### DD-6 — `manager.ts` gains a sink; the local Fastify WebSocket route stays

`attachSocket(id, socket)` becomes a thin wrapper over
`attachSink(id, { write, close })`. The cloud bridge is a second sink. Nothing
about PTY handling, the ring buffer or resize moves.

The local `/ws/terminal/:id` route is **not** deleted. It works, it is how
anything running on the machine itself attaches, and removing it is behavioural
surgery unrelated to this plan — the same argument [`I-12`](../Ideas.md) makes
about the two-hosts branch.

### DD-7 — The detach timer is replaced by a ceiling and an explicit close

`DETACH_TTL_MS` goes. A session now ends only when: the owner closes it, its
shell exits, the machine restarts, the machine's terminal access is switched off,
or the pairing is revoked.

That timer was silently bounding how many `node-pty` processes could accumulate,
so its replacement is explicit:

- `MAX_TERMINAL_SESSIONS = 10` per machine. The refusal is a specific reason the
  page can render, never a 500.
- The ring buffer stays 256 KB per session — bounded, and 10 × 256 KB is small.
- Every live session is listed with its age, so accumulation is visible rather
  than discovered.

### DD-8 — Output is coalesced and rate-capped before it reaches Realtime

PTY output is chatty and Realtime bills per message, so raw forwarding is both
slow and expensive.

- **Flush at 30 ms or 8 KB, whichever comes first.** 30 ms keeps SC-001's 200 ms
  budget comfortable while collapsing a burst of single-byte writes into one
  message.
- **`TERMINAL_OUTPUT_MAX_BYTES = 64 KB` per message**, well under Realtime's
  ceiling and consistent with `TRANSCRIPT_BATCH_MAX_BYTES`'s 128 KB precedent.
- **Throttle:** sustained output above 256 KB/s for 3 s stops forwarding, emits a
  `throttled` notice, and keeps the PTY running and the ring filling. The page
  shows a suppression banner offering to interrupt the command, and resumes when
  output falls back under the bar.

Without the throttle, one `yes` in a browser terminal is a quota event rather
than a slow terminal. This is the specific cost DD-1 accepted, and it is bought
off here rather than left to be discovered on a bill.

### DD-9 — The off switch reuses the per-machine settings path

`SETTING_TERMINAL_ACCESS` joins `DAEMON_SETTABLE_KEYS`. The Machines card already
renders a per-runtime toggle for WIP snapshots
([`machines.tsx:425`](../../apps/web/src/app/machines/machines.tsx:425)) and
reports confirmed values back through the heartbeat's `settings` map, so a switch
flipped locally shows up in the hosted UI without a second mechanism. Default
`on`; switching it off kills live sessions on that machine rather than leaving
them running invisibly.

This is AGENTS.md §14's check answered in the same PR as the feature, not
deferred to [`I-10`](../Ideas.md).

## Phases

### M16 — a live channel to a machine (foundational)

Delivers the ability for the control plane and a paired machine to hold a live,
authenticated, two-way conversation, and rebuilds the terminal manager around it.
Demos to nobody: at the end of M16 the Terminals page is exactly as dead as it
was. Depends on nothing not already shipped. Done when a keystroke sent on a
session topic reaches a PTY on a real machine and its output comes back, proved
from a script rather than a page.

**Unblocks M17**, and — not built here, but no longer blocked — the request/reply
half of
[`reaching-my-machine-from-the-browser`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)
and the [`I-11`](../Ideas.md) surfaces behind it.

### M17 — the terminal itself (serves US1–US4)

Delivers the four stories: a working shell from a browser, sessions that outlive
the tab, agent terminals, and a per-machine off switch. Depends on M16 entirely.
Done when the spec's acceptance scenarios can be walked on a deployed preview
against a real paired machine.

## Scope boundaries

- **Project files and folder browsing are not built here.** They are US1/US2 of
  [`reaching-my-machine-from-the-browser`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md),
  still awaiting owner review and still blocked on [`OQ-6`](../OpenQuestions.md)
  for their scope. This plan supersedes that spec's US3 only.
- **The other seven switched-off surfaces stay switched off** —
  [`I-11`](../Ideas.md). M16 makes them much cheaper; it does not make them free,
  and each has its own interface questions.
- **No general machine-RPC layer.** The control channel carries the terminal's own
  four request kinds and nothing else. Generalizing it belongs to whichever spec
  needs the second consumer, not to this one (§9).
- **No cloud audit of terminal activity** — DD-5, parked as
  [`D-26`](../Deferred.md).
- **`users.role` stays decorative.** This plan gives `workspace_members.role` a
  fifth enforced use; it does not touch the two-vocabularies problem
  [`G-35`](../KnownGaps.md) is about.
- **The dispatch doorbell stays parked.** DD-2 builds the daemon Realtime
  credential that [`D-12`](../Deferred.md) was waiting on, but does not spend it
  on dispatch. The 3 s poll is still correct and still always-on; converting it
  is D-12's own work, now unblocked.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| **SC-001** (echo under 200 ms) | `T-M17-06`, timed in the browser against a machine on a different network. Recorded as a number, not an impression |
| **SC-002** (progressive output) | `T-M17-06`, a command printing for 10 s, observed arriving in parts |
| **SC-003** (session survives an hour) | `T-M17-06`, started, tab closed, reopened in a different browser |
| **SC-004** (no "unavailable in the web app") | `T-M17-06`, Terminals opened in all four empty/error states |
| **SC-005** (machine stopped → name + last seen) | `T-M17-06`, machine deliberately stopped |
| **SC-006** (machine service only, no desktop app) | **Cannot be proved as stated** — installing the service without the desktop app is [`D-10`](../Deferred.md) and does not exist. `T-M17-06` proves the weaker form (a browser on a computer that is not the machine) and opens a `KnownGaps.md` entry for the difference, per the shipping-without-proof rule |
| **SC-007** (machine refuses when switched off) | `T-M17-06`, asserted against the machine's own refusal, not the page hiding a button |
| FR-009 (owner/admin only) | `T-M16-06` §D asserts the policy directly in SQL with two roles. The **live** two-member walk needs a second account and is expected to open a gap entry, same shape as `G-15`/`G-24` |

## Result

Both phases shipped. **M16** (band 20): the two Realtime topic families,
the daemon credential, the control-channel bridge, and the terminal
manager's sink/lifetime/throttle rework — done except `G-47`'s live-wire
pass. **M17** (band 21, this plan's other half): the browser channel
client, the re-plumbed Terminals page with all four empty/error states and
FR-009's role gate, agent terminals filtered against the machine's real
provider registry, the per-machine off switch (killing live sessions on
the daemon itself when flipped), and the Knowledge Center brought current —
done except the interactive-session live pass. Both open pieces are one
gap now, not two: `KnownGaps.md` **G-48**, since `T-M17-06`'s own live pass
found the same infrastructure regression (`SUPABASE_JWT_SIGNING_KEY`
malformed on both Vercel Preview and Development, not just one) blocking
both. A live bug was also found and fixed along the way, independent of
that gap: `T-M17-02`'s live pass caught react-query v5 reverting a
never-succeeded query to `"pending"` on every background retry, flickering
the Terminals page between its loading and error panes.

Every task's own unit suite is green (`@sparstrow/shared`, `@sparstrow/core`,
`web`, run per-package — the monorepo-wide `pnpm test` intermittently trips
one pre-existing, unrelated flaky test under full parallel load, flagged
separately, not a regression here). Everything reachable without the
blocked control channel was live-verified against band 21's own real
Vercel preview with a real paired machine, not simulated: never-paired,
machine-off (SC-005), the off-switch's full round trip including the
daemon's own confirmation log, a real pairing revoke detected and stopping
the daemon within one poll cycle, all four rewritten Knowledge Center
articles, SC-004's clean grep, both themes, and both Paper/Mono surface
characters. Judged production-ready to promote into `development` on the
same basis `G-47`/band 20 already established as this repo's precedent —
built, unit-tested, and live-verified everywhere the environment allows,
with the one remaining gap pointing at a five-minute owner fix rather than
more engineering. Full verification detail:
[`T-M17-06`](../tasks/M17/T-M17-06-verification.md).
