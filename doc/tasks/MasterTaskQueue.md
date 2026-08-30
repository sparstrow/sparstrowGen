# Master Task Queue

Global run order across every plan. This file is the **single source of truth for
what runs next**. Task documents hold the detail; this holds the sequence.

**Active bands only.** A band whose every row is done moves to
[`CompletedMasterQueue.md`](CompletedMasterQueue.md), leaving a one-line stub
in its place — see
[`README.md`](README.md#archiving-a-finished-band). Looking for a band that
isn't below? Check there.

> **Regenerated, not appended.** When a new plan contributes tasks, re-run the
> queue: insert them, re-evaluate every unfinished task's dependencies against
> the new set, and reorder. A task already `in progress` keeps its slot; anything
> still `queued` may be resequenced. Because this is a whole-file rewrite it
> collides with every open branch at once — **decompose only with no open task
> branches** (`AGENTS.md` §2.9).

> **Never edit this file from a task branch.** The Status column *mirrors* each
> task file's own `Status` row, which is the authoritative record. It is flipped
> at integration, on `development`, by whoever hands out the next wave — so it
> may lag reality between waves, by design. Full protocol and the drift check:
> [`README.md`](README.md#who-updates-the-queue-and-when). Sibling tasks in a
> band are adjacent rows in one table, so a branch that ticks its own row
> conflicts with every other branch in that band.

> **This file answers "what is *eligible*", not "what is *occupied*".** For what
> is running right now, use `gh pr list --state open` and `git worktree list`.

## Tags

| Tag | Meaning |
|---|---|
| `[S]` | Sequential — run alone, blocks dependents |
| `[P]` | Parallel — no shared files, hand to different workers freely |
| `[C]` | Concurrent — interleavable, but shares files, one worker at a time on those |

Full rationale in [`README.md`](README.md#tags) — that copy is canonical; this is
the quick-reference version.

## Status legend

`queued` · `in progress` · `done` · `done except <id>` · `blocked → OQ-n`
(see `../OpenQuestions.md`). Five values and no others, spelled the same way
here and in the task file — the drift check compares them. A leading `✅`/`🟢`
is decoration; the word is what is read. Canonical definitions in
[`README.md`](README.md#status-vocabulary).

A task blocked on an open question is **not** stalled as a whole: per
`AGENTS.md` §8 only the dependent checklist item waits, and the task is reported
as *done except OQ-n*.

---

## Queue

### Band 0 — complete

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-0).

### Band 1 — M2 foundations · no dependencies, fully parallel

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-1).

### Band 2 — M2 spine · gates every handler

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-2).

### Band 3 — M2 handlers · parallel across groups

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-3).

### Band 4 — M2 verification

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-4).

### Band 5 — M3 pairing, registration, heartbeat

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-5).

### Band 6 — M4 command spine ✅ complete

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-6).

### Band 7 — M5 transcripts (dual path)

Phase spec: [`M5/README.md`](M5/README.md). Decomposed 2026-08-11.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 7.1 | [T-M5-01 — event ingest route + batch contract](M5/T-M5-01-event-ingest-route.md) | `[S]` | — | ✅ done (2026-08-11) |
| 7.2 | [T-M5-02 — broadcast fan-out + `realtime.messages` RLS](M5/T-M5-02-broadcast-and-rls.md) | `[S]` | 7.1 | ✅ done (staging, 2026-08-11) |
| 7.3 | [T-M5-03 — core transcript pusher](M5/T-M5-03-transcript-pusher.md) | `[P]` | 7.1 | ✅ done (2026-08-11) |
| 7.4 | [T-M5-04 — durable replay: cursor, backfill, ceiling](M5/T-M5-04-durable-replay.md) | `[C]` | 7.3 | ✅ done (2026-08-11) |
| 7.5 | [T-M5-05 — UI: live transcript over the right transport](M5/T-M5-05-ui-live-transcript.md) | `[P]` | 7.2 | ✅ done (2026-08-12) |
| 7.6 | [T-M5-06 — verification](M5/T-M5-06-verification.md) | `[S]` | 7.1–7.5 | ⏸ deferred to the owner (2026-08-12) |

7.1 and 7.2 are `[S]` for the third phase running: they define the HTTP and SQL
contracts the other tasks compile against. 7.3 needs only the contract, so the
whole daemon half runs in parallel with the web half. 7.4 is `[C]` rather than
`[P]` because it shares `transcripts.ts` with 7.3.

**M5 does not inherit the Realtime doorbell after all.** M4 deferred it here on
the grounds that M5 must authenticate the daemon to Realtime anyway — and M5's
decision 1 declines to, because the server can broadcast from a route that
already holds the service role and already knows the workspace. The doorbell is
parked as [D-12](../Deferred.md) with what would unpark it.

**7.6 is deferred, not blocking.** Most of its checklist needs a second real
device/account, a genuine 60-second network cut on the daemon's machine, or a
browser pane that renders — none available to the agent building this, and the
network cut specifically withheld pending the owner's own say-so rather than
done unilaterally. Recorded as [`G-13`](../KnownGaps.md). M6 and M7 depend on
M4, not M5, and proceed regardless — see Band 8.

### Band 8 — M6 memory sync

Phase spec: [`M6/README.md`](M6/README.md). Decomposed 2026-08-12.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 8.1 | [T-M6-01 — sync contract + daemon routes](M6/T-M6-01-sync-contract.md) | `[S]` | — | done (2026-08-12) |
| 8.2 | [T-M6-02 — local schema: sync state + pull cursor](M6/T-M6-02-local-schema.md) | `[P]` | — | done (2026-08-12) |
| 8.3 | [T-M6-03 — push: hook + reconciliation sweep](M6/T-M6-03-push.md) | `[P]` | 8.1, 8.2 | done (2026-08-12) |
| 8.4 | [T-M6-04 — pull: command-triggered + full sweep](M6/T-M6-04-pull.md) | `[C]` | 8.1, 8.2 | done (2026-08-12) |
| 8.5 | [T-M6-05 — verification](M6/T-M6-05-verification.md) | `[S]` | 8.1–8.4 | ⏸ needs a second machine |

8.1 defines the HTTP contract 8.3 and 8.4 compile against; 8.2 is pure SQLite
with no dependency on it, so the two run fully in parallel. 8.3 and 8.4 are
`[C]` against each other rather than `[P]` because both live in
`packages/core/src/cloud/memory-sync.ts` — the same file split M5's transcript
pusher and its backfill sweep used.

**8.1–8.4 landed 2026-08-12; 8.5 has not.** Every assertion in it that matters
needs a second paired machine, which this repo does not have — recorded as
[`G-15`](../KnownGaps.md) rather than reported as passing. Two corrections the
spec got wrong, both caught before merge and written up in the phase README:
`content` had to become the whole file rather than the body (the body-only shape
was a permanent push/pull ping-pong), and the push route needed a cross-workspace
id guard the spec never named.

**M6 is mostly wiring over decisions M1 already made.** The cloud
`memory_notes` table, its sync-shaped index, and even the anticipated
`memory.sync` command kind were scaffolded in M1 and never connected to
anything — confirmed by research before writing task 01, not assumed.

### Band 9 — M7 route parity + Electron

Phase spec: [`M7/README.md`](M7/README.md). Decomposed 2026-08-13.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 9.1 | [T-M7-01 — the five missing routes](M7/T-M7-01-routes.md) | `[P]` | — | done (2026-08-13) |
| 9.2 | [T-M7-02 — Electron loads the hosted app](M7/T-M7-02-electron-hosted.md) | `[C]` | — | done (2026-08-13) |
| 9.3 | [T-M7-03 — Electron offline and failure screen](M7/T-M7-03-electron-offline.md) | `[C]` | — | done (2026-08-13) |
| 9.4 | [T-M7-04 — verification](M7/T-M7-04-verification.md) | `[S]` | 9.1–9.3 | ⏸ not run — [`G-16`](../KnownGaps.md) |

M5, M6 and M7 are `[P]` against each other: transcripts, memory sync, and the
Electron shell touch disjoint files. M7 needs only M2, so it can start at any
time. Inside the band, 9.1 is `[P]` against the other two — it lives entirely in
`apps/web/src/app/` — while 9.2 and 9.3 are `[C]` because both edit
`packages/desktop/src/main.ts`.

**9.1–9.3 landed 2026-08-13; 9.4 has not been run.** The routes are registered
(the build lists all five) and the Electron half is tested as logic, but nothing
has been *rendered* — no page looked at, no window opened, no offline screen
seen. Recorded as [`G-16`](../KnownGaps.md). A runtime route check was attempted
and blocked by the app's own "not configured" guard: this worktree has no
`.env.local`, and copying Supabase secrets into one was not worth a routing
check.

**Two things decomposition found, both from reading the code rather than the
plan's bullets.** The routes half is smaller than it looks: the TanStack-to-Next
adapter already solves route params, and all four detail endpoints already exist
in `/api/v1`, so each page is a seven-line re-export. The Electron half is
**blocked on a premise that stopped being true** — "point `loadURL` at the hosted
app" assumes a deployment, and there wasn't one at the time. 9.2 ships the URL
as configuration so the work lands anyway, but section D of 9.4 cannot be
verified until a machine's `SPARSTROW_CLOUD_URL`/`SPARSTROW_APP_URL` actually
points at a deployed environment. **Update 2026-08-16:** `staging.sparstrow.com`
now exists (see [`../runbooks/deploy-web-app.md`](../runbooks/deploy-web-app.md)),
but no machine points at it yet — that remains the phase's one owner action.

Also caught: the plan's bullet says the goal route is `goals`, while the router
and the component both say `/tasks/goals/$goalId`. Building the plan's version
would produce a page that renders correctly and is linked from nowhere.

---

## Setup and Machines — bands 10–13

Plan: [`../plans/2026-08-16-setup-and-machines.md`](../plans/2026-08-16-setup-and-machines.md).
Spec: [`../specs/2026-08-16-setup-and-machines.md`](../specs/2026-08-16-setup-and-machines.md).
Decomposed 2026-08-16.

**The first bands in this repo named after something the owner can open.**
M1–M7 were all foundational — none of them was named after a surface. Bands 10,
12 and 13 serve user stories; band 11 is the only foundational one, and it is
small on purpose.

**Band 10 and band 11 are `[P]` against each other** and can run at the same
time: M8 lives in `packages/ui` routes, nav and `packages/core/src/cli`, while
M9 lives in the schema, `apps/web/src/lib/api/handlers` and storage. Their only
shared file is `hooks.ts`, and M8 does not touch it. **Band 12 edits
`settings.tsx`, which band 10 also edits** — 12.2 adds two forms there while
10.2 removes the Machines card, so the two must not be worked simultaneously by
different agents.

### Band 10 — M8 Machines gets a menu of its own · **serves US1** ✅ complete

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-10).

### Band 11 — M9 workspace and profile identity · **foundational**

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-11).

### Band 12 — M10 the setup guide · **serves US2**

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-12).

### Band 13 — M11 walk the spec against staging · **serves US3–US5**

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-13).

### Band 4b — auth completeness (2026-08-10)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-4b).

### Band 14 — D1 design token conformance (2026-08-19)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-14).

### Band 15 — D2 parametric theming (2026-08-19) · ✅ **done**

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-15).

### Band 16 - Settings Redesign & Theme Architecture (2026-08-22)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-16).

### Band 17 — G23 shared sidebar nav groups (2026-08-23)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-17).

### Band 18 — M12–M15 chat message sending (2026-08-23)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-18).

### Band 19 — VR retire the Vite app (2026-08-24)

✅ **Archived 2026-08-25 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-19).

### Band 20 — M16 a live channel to a machine (2026-08-24)

✅ **Archived 2026-08-26 — done except `G-47`, which does not block the
archive per `doc/tasks/README.md`'s own rule.** Full task table, tags and
notes: [`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-20).

### Band 21 — M17 the terminal itself (2026-08-24)

✅ **Archived 2026-08-27 — done except `G-48`, which does not block the
archive per `doc/tasks/README.md`'s own rule.** Full task table, tags and
notes: [`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-21).

### Band 22 — WA every write becomes a Server Action (2026-08-24)

✅ **Archived 2026-08-26 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-22).

### Band 23 — M18 the access model's foundation (2026-08-24)

✅ **Archived 2026-08-26 (drift correction — landed on `development` via
PR #129 without this flip; caught while promoting band 22, per
`doc/tasks/README.md`'s "check the other bands too" step).** Full task
table, tags and notes: [`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-23).

### Band 25 — DI the daemon gets a real identity (2026-08-27) · **run this first**

Plan: [`../plans/2026-08-27-the-daemon-gets-a-real-identity.md`](../plans/2026-08-27-the-daemon-gets-a-real-identity.md).
Spec: [`../specs/2026-08-24-a-terminal-on-my-machine.md`](../specs/2026-08-24-a-terminal-on-my-machine.md)
— no new spec; this delivers stories that one already owns.
Phase spec: [`DI/README.md`](DI/README.md). Decomposed 2026-08-27.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 25.1 | [T-DI-01 — the session topic carries the runtime id](DI/T-DI-01-session-topic-runtime-id.md) | `[S]` | — | done (2026-08-27) |
| 25.2 | [T-DI-02 — the daemon identity: schema, helper, policies](DI/T-DI-02-daemon-identity-schema.md) | `[S]` | 25.1 | written, not applied — owner (2026-08-27) |
| 25.3 | [T-DI-03 — the token route mints a Supabase session](DI/T-DI-03-token-route-supabase-session.md) | `[S]` | 25.2 | done except live checks (2026-08-27) |
| 25.4 | [T-DI-04 — core adapts to the new credential](DI/T-DI-04-core-credential-lifetime.md) | `[P]` | 25.3 | done (2026-08-27) |
| 25.5 | [T-DI-05 — verification: the live pass that has never run](DI/T-DI-05-verification.md) | `[S]` | 25.1–25.4 | blocked → owner applies SQL, then a live pass |

25.1–25.3 are `[S]` in a chain: each defines the contract the next compiles or
authorizes against, and they touch overlapping files. 25.4 is `[P]` — it lives
entirely in `packages/core` and needs only 25.3's response shape.

**This band is ahead of band 24 in priority despite the higher number.** M16 and
M17 both merged and neither has ever carried a byte: the daemon could not sign a
credential Supabase would accept (`G-48` — Supabase never exports an asymmetric
private key, confirmed live in the dashboard 2026-08-27), *and* the credential
`DD-2` specified could never have passed `018_terminal_channels.sql`'s RLS
anyway, because it deliberately carries no `sub` and those policies resolve the
caller through `workspace_members` ([`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md)).
Two independent blockers, each hiding the other, both found on 2026-08-27.

**No UI work.** M17's surfaces, states and sentences are all built and stay
exactly as they are. This band changes one topic string, adds one table, one
function and four policies, and rewrites one module's internals.

**Landed on `development` 2026-08-27, code-complete and unverified** — see
[`KnownGaps.md` `G-49`](../KnownGaps.md). `T-DI-01` and `T-DI-04` are fully
done; `T-DI-02`'s SQL is written but not applied to any database (needs a
Supabase CLI login or MCP authorization no agent in this session had);
`T-DI-03` is done except the live checks that need `T-DI-02`'s SQL; `T-DI-05`
is blocked on both. Also found and fixed, in already-merged M16 code:
[`BUG-2026-08-27-realtime-refresh-never-took-effect`](../bug/BUG-2026-08-27-realtime-refresh-never-took-effect.md)
— core's credential refresh had never taken effect.

**25.5 updated 2026-08-28** — `T-DI-02`'s SQL is now applied and a real
daemon paired live (PR #149). Two genuine platform-adjacent races were found
and fixed in the same pass:
[`BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth`](../bug/BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth.md)
and
[`BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined`](../bug/BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined.md).
`T-DI-05` is now blocked on neither of those, but on a third, non-repo issue
found while chasing the remaining timeout:
[`BUG-2026-08-28-private-broadcast-channels-not-relaying`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md)
— private-channel broadcast relay not working on this Supabase project,
escalated to Supabase, outside this repo's code. Full task file is the
authoritative record; this line is the mirror.

### Band 26 — CS chat session & conversation UX (2026-08-27)

✅ **Archived 2026-08-28 — every row done.** Full task table, tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-26--cs-chat-session--conversation-ux-2026-08-27).
`T-CS6-02` found and fixed two cross-story regressions that each phase's own
verification had passed over; `G-52` and `G-53` remain open.

✅ **Archived 2026-08-29 — every row done or done-except.** Full task table,
tags and notes:
[`CompletedMasterQueue.md`](CompletedMasterQueue.md#band-27--am-seeing-what-my-agent-made-2026-08-29).
`T-AM4-02` found and fixed a real focus-restoration defect its own closing
verification pass caught, that no earlier phase verification had; `G-55`
remains open — the produced-file pipeline has never run end to end against a
live daemon.

**Cross-phase collisions worth knowing before scheduling:**

- **`apps/web/src/app/chat/chat.tsx`** — 27.7 edits the preview panel. The open
  [`BUG-2026-08-28-project-chat-cannot-choose-model-at-creation`](../bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md)
  fix edits the *creation form* in the same file. Different regions, same file;
  if both run at once, whoever is second rebases.
- **`doc/KnownGaps.md`** — 27.3 extends `G-53` and every verification task adds
  entries. The two open `task/T-DI-05-*` branches are also editing it heavily
  and already conflict with each other. Expect to resolve by hand; do not take
  `--ours` wholesale.
- **`packages/shared/drizzle/policies/`** — 27.3 claims `028`. The open
  `T-DI-05-live-verification` branch adds a `021_daemon_identities_workspace_index.sql`,
  an out-of-sequence *lower* number that will not collide but does mean the
  directory is not a reliable guide to "next free". `028` is next free as of
  2026-08-29; re-check before writing it.
- **Band 25 (DI) and band 24** — no file overlap with this band at all. DI is
  terminals/realtime/daemon identity; band 24 is project files and browsing.

**Decomposed while `task/T-DI-05-*` was still open — deliberately, and with the
owner's explicit go-ahead 2026-08-29.** The `decomposing-plans` gate normally
refuses this. Two things made it the right call rather than a shortcut, and
both were true *before* the exception was asked for:

1. **The plan pre-registered it.** Its Sequencing section named the real
   trigger as *"band 26 merging to `development`"* and explicitly rejected
   "drain to zero branches" as the criterion, on the grounds that it "would
   make this plan hostage to a third-party ticket". Band 26 merged 2026-08-29
   ([#174](https://github.com/sparstrow/sparstrowGen/pull/174)).
2. **The gate's two stated reasons don't bite here.** Its *correctness* reason
   is that open branches mean the code is still moving — but T-DI-05 touches
   terminals, realtime and daemon identity, and this band's foundation
   (`chat_message_attachments`, `chat-turn.ts`, the chat components) is fully
   landed and untouched by it. Its *merge-conflict* reason is about regenerating
   this file — and neither T-DI-05 branch touches it, correctly, per §2.9.

T-DI-05 is blocked on a filed Supabase support ticket
([`BUG-2026-08-28-private-broadcast-channels-not-relaying`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md))
and could stay open indefinitely. **This is a documented exception for this
band, not a precedent** — the gate stands for every other decomposition.

### Band 24 — M22–M24 reaching my machine from the browser (2026-08-24)

Plan: [`../plans/2026-08-24-reaching-my-machine-from-the-browser.md`](../plans/2026-08-24-reaching-my-machine-from-the-browser.md).
Spec: [`../specs/2026-08-24-reaching-my-machine-from-the-browser.md`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)
— **owner-reviewed 2026-08-24**, accepted for US1, US2 and US4.

**Not decomposed yet, and deliberately so.** M22 extends the request/reply
envelope `T-M16-01` defines, and writing tasks against M16's plan outline
rather than its shipped shape is the mistake this file already records for
M13→M14 ("written against M12's actual shipped shape rather than the plan's
outline — which is what this repo's own precedent asks for"). These tasks get
written when band 20 closes.

| Phase | Serves | Depends on | Status |
|---|---|---|---|
| M22 — the bridge | foundational | **band 20 (M16)** | not decomposed |
| M23 — a project's files | US1 | M22 | not decomposed |
| M24 — Browse, and which machine | US2 + US4 | M22, M23, **band 23's M20** | not decomposed |

**M24 is the cross-plan edge worth knowing about before scheduling anything.**
US2's folder picker is bounded by what a machine says it shares, which is the
access model's US4 — `OQ-6`'s answer. A picker built before that boundary
exists is option A, which the owner rejected. US1 has no such dependency: a
project's files are inside a registered project, which is the tightest boundary
and needs no configuration.

**US3 (terminals) is not in this band.** Superseded before the review gate;
bands 20 and 21 own it.

## Blocked items

> For a single checklist of everything that needs the owner specifically, see
> [`../runbooks/README.md`](../runbooks/README.md) — the rows below explain
> *why* each is in the queue; that file is where you go to actually act on one.

| Item | Blocked by | Effect |
|---|---|---|
| ~~**M11 (band 13) in its entirety**~~ | ~~**Owner action**~~ | **Resolved 2026-08-22.** `T-M11-01` paired a scratch machine (its own secrets/data dirs, not the owner's `~/.sparstrow`) live against `staging.sparstrow.com`, and 13.1–13.4 ran against it — a real dispatched run, all four failure messages, the Electron shell launched three times. The owner's own day-to-day machine is still unswitched, which is fine: nothing in this band needed it. |
| GitHub / Google sign-in | **Deferred → [D-8](../Deferred.md)** | Not blocked work — parked by the owner 2026-08-10. Code is complete and verified; the buttons render disabled and light up on their own once the providers are enabled. |
| Leaked password protection | **Supabase plan** | Requires Pro; not available on the current plan (confirmed 2026-08-10). No SQL equivalent, so nothing in this repo can fix it. Verified off by signing up with `password123` and getting a session. Not an action item — the advisor will keep flagging it. |
| ~~`/runs/[runId]` transcript~~ | ~~M5 (7.6)~~ | **Resolved 2026-08-22.** `T-M11-02` dispatched a real run and watched `/runs/[runId]` populate live — cloud/local `run_events` counts matched exactly (3/3 and 13/13 across two runs). Rendering the transcript for every provider is not fully closed — see [`BUG-2026-08-22-antigravity-transcript-not-rendered`](../bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md) — but the page is no longer empty by construction. |
| Realtime doorbell for dispatch | **Deferred → [D-12](../Deferred.md)** | Not blocked work. The 3s poll is correct and always-on; the doorbell is a latency improvement that M5's decision 1 declined to buy with a second daemon auth model. |
| Agent definitions differ between cloud and machine | **Deferred → [D-9](../Deferred.md)** | Not blocked work. M4 resolves a cloud agent to a local one by slug and blocks legibly on a miss; syncing definitions is a separate feature with its own conflict model. |
| **Band 24 (M22–M24) in its entirety** | **Band 25 (DI)**, not band 20 | Hard, not soft. This plan builds no transport of its own — a browser reaches a machine over M16's `machine:<workspace_id>:<runtime_id>` control channel or not at all, and building a second path is the relay service M16's DD-1 rejected. **Corrected 2026-08-27:** the blocker used to read "band 20 (M16)", which was true and insufficient — band 20 merged, and its transport has still never carried a byte. The real gate is band 25, which makes a daemon able to authenticate to that channel and pass its RLS. Band 24's tasks are also not written yet, on purpose: they extend an envelope `T-M16-01` defines, and now also a topic shape `T-DI-01` changes. |
| **23.4's `users.role` drop** | **Owner action** | A column drop is `AGENTS.md` §3.7 destructive even when the column is provably inert (nothing reads it; the profile route strips it with a test). Everything else in 23.4 proceeds without it. |
| **M24 (Browse) specifically** | **M20, in band 23's plan** | The folder picker's boundary is what a machine says it shares — the access model's US4, which is `OQ-6`'s answer. A picker built before that exists is `OQ-6` option A, which the owner rejected. M23 (project files) has no such dependency and ships first. |

`OQ-1` (protecting uncommitted agent work) was **answered and built** on
2026-08-10, ahead of M4 rather than inside it — the owner approved the
recommendation, and the feature is small and self-contained enough that shipping
it beat writing a task for it. When a run ends, core snapshots the project's
working tree to `refs/sparstrow/wip/<run-id>` on that machine: not a branch, not
a commit on any branch, never pushed, `.gitignore` respected, and switchable from
Settings. Rationale and the two narrowings from the original option B are settled
decision 5 in the plan. **M4 is no longer gated on anything.**

**`OQ-6` and `OQ-7` were both answered by the owner on 2026-08-24**, and
between them they created bands 22, 23 and 24. `OQ-6` (how much of a machine a
signed-in person may look at) was answered **option B** and closed by
owner-reviewing [`what-an-agent-is-allowed-to-do`](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md),
where it is US4 — band 23 turns it into a table, and M20 gives it a screen.
`OQ-7` (Server Action or keep the existing mutation) was answered **option A**,
against that question's own recommendation of C, and is band 22 in full. Neither
is in `OpenQuestions.md` any more; both are recorded where they are consumed.

`OQ-2` (how an agent completes a browser pass) was **answered and closed** on
2026-08-10 during M3, and removed from `OpenQuestions.md`. Restoring magic-link
sign-in made it solvable: an agent mints a one-time token with the Supabase
admin API and navigates to `/auth/confirm` — the product's own sign-in path, no
password typed and no bypass. Procedure:
[`../runbooks/agent-browser-session.md`](../runbooks/agent-browser-session.md).
