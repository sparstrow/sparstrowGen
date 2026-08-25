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

Phase spec: [`M16/README.md`](M16/README.md). Plan:
[`2026-08-24-a-terminal-on-my-machine.md`](../plans/2026-08-24-a-terminal-on-my-machine.md).
Decomposed 2026-08-24 — six tasks, all written.

**Foundational: nothing in this band is visible to the owner.** It builds the
daemon-side Realtime credential that M5 named and declined, the two channel
families, their policies, and the terminal manager rework. At the end of it the
Terminals page is exactly as dead as it is today.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 20.1 | [T-M16-01 — channel contracts](M16/T-M16-01-channel-contracts.md) | `[S]` | — | queued |
| 20.2 | [T-M16-02 — daemon Realtime credential](M16/T-M16-02-daemon-realtime-credential.md) | `[P]` | 20.1 | queued |
| 20.3 | [T-M16-03 — `017_terminal_channels.sql`](M16/T-M16-03-channel-policies.md) | `[P]` | 20.1 | queued |
| 20.4 | [T-M16-04 — core: the Realtime connection](M16/T-M16-04-core-realtime-connection.md) | `[C]` | 20.1, 20.2 | queued |
| 20.5 | [T-M16-05 — core: terminal manager rework](M16/T-M16-05-terminal-manager.md) | `[P]` | 20.1 | queued |
| 20.6 | [T-M16-06 — verification](M16/T-M16-06-verification.md) | `[S]` | 20.1—20.5 | queued |

20.1 is `[S]` for the same reason M3's and M4's first tasks were: four tasks in
three packages are written against its topics and event names, and 20.3 authors a
policy that pins two of those names literally. 20.4 is `[C]` rather than `[P]`
because it edits `packages/core/src/index.ts`, which 20.5 also touches.

**20.2 needs an owner action** — a signing credential set on the Vercel project.
That task adds the row to [`../runbooks/README.md`](../runbooks/README.md).
Nothing else in the band is blocked on it; 20.6 is.

**This band unblocks more than M17.** The request/reply half of
[`reaching-my-machine-from-the-browser`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)
and the [`I-11`](../Ideas.md) surfaces behind it become buildable once a machine
can be asked a question at all. Neither is built here, and both still need their
own owner review — see that spec's status.

### Band 21 — M17 the terminal itself (2026-08-24)

Phase spec: [`M17/README.md`](M17/README.md). Same plan as band 20.
Decomposed 2026-08-24 — six tasks, all written.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 21.1 | [T-M17-01 — the channel client](M17/T-M17-01-terminal-channel-client.md) | `[S]` | 20.6 | queued |
| 21.2 | [T-M17-02 — the Terminals page](M17/T-M17-02-terminals-page.md) | `[S]` | 21.1 | queued |
| 21.3 | [T-M17-03 — agent terminals](M17/T-M17-03-agent-terminals.md) | `[C]` | 21.2 | queued |
| 21.4 | [T-M17-04 — the per-machine off switch](M17/T-M17-04-terminal-access-switch.md) | `[P]` | 20.6 | queued |
| 21.5 | [T-M17-05 — Knowledge Center](M17/T-M17-05-knowledge-center.md) | `[P]` | 21.2 | queued |
| 21.6 | [T-M17-06 — verification](M17/T-M17-06-verification.md) | `[S]` | 21.1—21.5 | queued |

21.3 is `[C]` rather than `[P]` because it edits `terminals.tsx`, which 21.2
writes. 21.4 is `[P]`: `machines.tsx` and core's settings handling are touched by
nothing else in the band, so it can run alongside the whole web half.

**21.5 closes [`BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists`](../bug/BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists.md)**
— pre-existing drift, filed 2026-08-24 while planning this work: the Terminals
Knowledge Center article describes a transport that no longer exists and states
the opposite of the machine's real session behaviour.

**Runs against nothing else.** Bands 19 and 20 must be complete first. Any other
work touching `apps/web/src/app/terminals/`, `machines.tsx`, or
`packages/core/src/terminal/` must wait rather than run `[P]` alongside — the
file overlap is total.

### Band 22 — WA every write becomes a Server Action (2026-08-24)

Plan: [`../plans/2026-08-24-server-action-write-conversion.md`](../plans/2026-08-24-server-action-write-conversion.md).
Spec: n/a (internal). Phase spec: [`WA/README.md`](WA/README.md).

Executes [`OQ-7`](../OpenQuestions.md)'s answer — **option A**, chosen by the
owner on 2026-08-24 over the question's own 8/10 recommendation (option C).
87 mutation call sites across 27 files stop POSTing to `/api/v1` and become
Server Actions. Roughly 20 of those sites are stub-backed and excluded by the
plan's DD-6, so the real converted count is lower and each task states its own.

**This band changes nothing a user can see, deliberately.** That is what makes
its verification the hard kind: `T-WA-09` grades "nothing changed", which a
green typecheck cannot demonstrate.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 22.1 | [T-WA-01 — the convention, and `teams` as the worked example](WA/T-WA-01-convention-and-teams.md) | `[S]` | — | ✅ done 2026-08-24 — 7 hooks and 9 handlers gone, all seven actions walked live; found and fixed [`BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error`](../bug/BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error.md), opened [`G-37`](../KnownGaps.md) |
| 22.2 | [T-WA-02 — projects](WA/T-WA-02-projects.md) | `[C]` | 22.1 | queued |
| 22.3 | [T-WA-03 — agents](WA/T-WA-03-agents.md) | `[C]` | 22.1 | queued |
| 22.4 | [T-WA-04 — tasks, goals, attention](WA/T-WA-04-tasks-goals-attention.md) | `[C]` | 22.1 | queued |
| 22.5 | [T-WA-05 — skills](WA/T-WA-05-skills.md) | `[C]` | 22.1 | queued |
| 22.6 | [T-WA-06 — runs, schedule, pipelines](WA/T-WA-06-runs-schedule-pipelines.md) | `[C]` | 22.1 | queued |
| 22.7 | [T-WA-07 — chat, messages](WA/T-WA-07-chat-messages.md) | `[C]` | 22.1 | queued |
| 22.8 | [T-WA-08 — settings, profile, workspace, machines](WA/T-WA-08-settings-profile-workspace-machines.md) | `[C]` | 22.1 | queued |
| 22.9 | [T-WA-09 — verification](WA/T-WA-09-verification.md) | `[S]` | 22.1–22.8 | queued |

22.1 is `[S]` and gates the band: it authors `lib/action-result.ts` and the
worked example the other seven copy. **Everything between is `[C]`, never `[P]`**
— each owns its own page files, and all eight delete from
`apps/web/src/api/hooks.ts`, a 2310-line file two agents cannot share.

**22.1 found a defect that would have hit all 21 files** and fixed it before
they were written: the middleware redirected every Server Action POST from a
signed-out browser to `/login`, so an expired session produced a Next.js
Runtime Error overlay instead of a message. The carve-out now covers actions,
and it is a phase decision in [`WA/README.md`](WA/README.md) rather than a note
in one task. This is the argument for `[S]`-gating a phase on a worked example.

**Two hooks have consumers in two different tasks**, and whichever lands second
deletes them: `useCreateRun` (22.4 and 22.6), and the two chat-session hooks
(22.3 and 22.7, where 22.7 owns `app/chat/actions.ts`). These are the band's
only real coordination points and both tasks name them.

**Runs against bands 20/21 with care.** 22.8 edits `machines.tsx`, which
`T-M17-04` also touches, and 22.2 has no overlap at all. If M17 is in flight,
run 22.8 last or after it — the rest of the band is free.

### Band 23 — M18 the access model's foundation (2026-08-24)

Plan: [`../plans/2026-08-24-what-an-agent-is-allowed-to-do.md`](../plans/2026-08-24-what-an-agent-is-allowed-to-do.md).
Spec: [`../specs/2026-08-24-what-an-agent-is-allowed-to-do.md`](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md)
— **owner-reviewed 2026-08-24**. Phase spec: [`M18/README.md`](M18/README.md).

**Foundational: nothing in this band is visible to the owner.** It builds the
subject/level/scope vocabulary, a resolver that reports which level decided
each outcome, the first tool catalogue this repo has ever had, the cloud
columns for the workspace-level policy, and the two tables `OQ-6`'s answer
needs. At the end of it every screen looks exactly as it does today.

**This band is where [`OQ-6`](../OpenQuestions.md) stops being a document.**
Its answer — nominated locations, read-only, with a sensible pairing default —
becomes `machine_shared_locations` in 23.4. The surface that renders it is
M20's.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 23.1 | [T-M18-01 — the access vocabulary](M18/T-M18-01-access-vocabulary.md) | `[S]` | — | queued |
| 23.2 | [T-M18-02 — the provenance resolver](M18/T-M18-02-provenance-resolver.md) | `[P]` | 23.1 | queued |
| 23.3 | [T-M18-03 — the tool catalogue](M18/T-M18-03-tool-catalogue.md) | `[P]` | 23.1 | queued |
| 23.4 | [T-M18-04 — schema, policies, and dropping `users.role`](M18/T-M18-04-schema-and-policies.md) | `[P]` | 23.1 | queued |
| 23.5 | [T-M18-05 — core reads the workspace policy from the cloud](M18/T-M18-05-core-cloud-policy.md) | `[C]` | 23.4 | queued |
| 23.6 | [T-M18-06 — verification, and the `SC-006` sentence](M18/T-M18-06-verification.md) | `[S]` | 23.1–23.5 | queued |

23.1 is `[S]` for the same reason `T-M16-01` gates M16: three tasks in two
packages are written against its types. 23.2, 23.3 and 23.4 are genuinely
disjoint — different files, different packages, hand them to three workers.
23.5 is `[C]` because it edits `tool-resolution.ts`, which sits on the spawn
path of every run.

**23.4 needs the owner** for one step: it drops `users.role`, and a column drop
is an `AGENTS.md` §3.7 destructive operation even when the column is provably
inert. It also collides on a file *name* — M16's plan claims
`policies/017_terminal_channels.sql`, so 23.4 must check the directory and take
`018` if M16 landed first.

**23.6 can fail the band on purpose.** `SC-006` asks for one sentence expressing
a person's view-only grant in the model's own vocabulary; if it cannot be
written without inventing a fifth concept, the model is not finished and the
band reports done-except rather than passing itself.

**Runs `[P]` against band 22.** Zero file overlap — band 22 is entirely inside
`apps/web/src/app/**` and `hooks.ts`; band 23 is `packages/shared`,
`packages/core`, and SQL. The one seam is 22.3's warning not to add tool-name
validation to the agent form, because 23.3 is building the catalogue that
validation needs.

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
| **Band 24 (M22–M24) in its entirety** | **Band 20 (M16)** | Hard, not soft. This plan builds no transport of its own — a browser reaches a machine over M16's `machine:<workspace_id>:<runtime_id>` control channel or not at all, and building a second path is the relay service M16's DD-1 rejected. Its tasks are also not written yet, on purpose: they extend an envelope `T-M16-01` defines. |
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
