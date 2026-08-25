# Master Task Queue

Global run order across every plan. This file is the **single source of truth for
what runs next**. Task documents hold the detail; this holds the sequence.

> **Regenerated, not appended.** When a new plan contributes tasks, re-run the
> queue: insert them, re-evaluate every unfinished task's dependencies against
> the new set, and reorder. A task already `in progress` keeps its slot; anything
> still `queued` may be resequenced.

## Tags

| Tag | Meaning |
|---|---|
| `[S]` | Sequential — run alone, blocks dependents |
| `[P]` | Parallel — no shared files, hand to different workers freely |
| `[C]` | Concurrent — interleavable, but shares files, one worker at a time on those |

Full rationale in [`README.md`](README.md#tags) — that copy is canonical; this is
the quick-reference version.

## Status legend

`queued` · `in progress` · `done` · `blocked → OQ-n` (see `../OpenQuestions.md`)

A task blocked on an open question is **not** stalled as a whole: per
`AGENTS.md` §8 only the dependent checklist item waits, and the task is reported
as *done except OQ-n*.

---

## Queue

### Band 0 — complete

| # | Task | Tag | Status |
|---|---|---|---|
| 0.1 | M1 — cloud schema, RLS, FK indexes | `[S]` | ✅ done (staging, 2026-08-09) |

### Band 1 — M2 foundations · no dependencies, fully parallel

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 1.1 | [T-M2-01 — case converter](M2/T-M2-01-case-converter.md) | `[P]` | — | done |
| 1.2 | [T-M2-02 — workspace resolver + bootstrap](M2/T-M2-02-workspace-resolver.md) | `[P]` | — | done |

### Band 2 — M2 spine · gates every handler

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 2.1 | [T-M2-03 — route skeleton + middleware](M2/T-M2-03-route-skeleton.md) | `[S]` | 1.1, 1.2 | done |

### Band 3 — M2 handlers · parallel across groups

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 3.1 | [T-M2-04 — identity & config handlers](M2/T-M2-04-handlers-identity.md) | `[P]` | 2.1 | done |
| 3.2 | [T-M2-05 — work handlers](M2/T-M2-05-handlers-work.md) | `[P]` | 2.1 | done |
| 3.3 | [T-M2-06 — execution handlers](M2/T-M2-06-handlers-execution.md) | `[P]` | 2.1 | done |
| 3.4 | [T-M2-07 — health, providers rewire, 501 stubs](M2/T-M2-07-health-and-stubs.md) | `[C]` | 2.1 | done |

3.4 is `[C]` rather than `[P]` because it edits `providers.tsx` and the shared
dispatch table, which 3.1–3.3 also register into.

### Band 4 — M2 verification

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 4.1 | [T-M2-08 — verification & browser pass](M2/T-M2-08-verification.md) | `[S]` | 3.1–3.4 | done |

### Band 5 — M3 pairing, registration, heartbeat

Phase spec: [`M3/README.md`](M3/README.md). Decomposed 2026-08-10.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 5.1 | [T-M3-01 — pairing redemption RPC](M3/T-M3-01-redeem-rpc.md) | `[S]` | — | ✅ done (staging, 2026-08-10) |
| 5.2 | [T-M3-02 — daemon API surface in Next](M3/T-M3-02-daemon-api.md) | `[S]` | 5.1 | ✅ done (staging, 2026-08-10) |
| 5.3 | [T-M3-03 — cloud client + token storage](M3/T-M3-03-cloud-client.md) | `[P]` | 5.2 | ✅ done (2026-08-10) |
| 5.4 | [T-M3-04 — `sparstrow pair` CLI](M3/T-M3-04-pair-cli.md) | `[P]` | 5.3 | ✅ done (2026-08-10) |
| 5.5 | [T-M3-05 — registration + capability probe](M3/T-M3-05-registration.md) | `[P]` | 5.3 | ✅ done (2026-08-10) |
| 5.6 | [T-M3-06 — heartbeat loop + status derivation](M3/T-M3-06-heartbeat.md) | `[C]` | 5.3 | ✅ done (2026-08-10) |
| 5.7 | [T-M3-07 — Runtimes UI: pair, list, revoke](M3/T-M3-07-runtimes-ui.md) | `[P]` | 5.1 | done (2026-08-10) |
| 5.8 | [T-M3-08 — verification](M3/T-M3-08-verification.md) | `[S]` | 5.1–5.7 | done (2026-08-10) |

5.1 and 5.2 are `[S]` because they define the contract every other task is
written against. 5.7 needs only the RPC, so the UI can be built in parallel with
all of the core work. 5.6 is `[C]` rather than `[P]` because it edits
`packages/core/src/index.ts` and the web health handler, which 5.5 and 5.7 also
touch.

### Band 6 — M4 command spine ✅ complete

Phase spec: [`M4/README.md`](M4/README.md). Decomposed 2026-08-10.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 6.1 | [T-M4-01 — command RPCs: enqueue, claim, ack](M4/T-M4-01-command-rpcs.md) | `[S]` | — | ✅ done (2026-08-10) |
| 6.2 | [T-M4-02 — daemon command API in Next](M4/T-M4-02-daemon-command-api.md) | `[S]` | 6.1 | ✅ done (2026-08-10) |
| 6.3 | [T-M4-03 — enqueue path: retire the M4 stubs](M4/T-M4-03-enqueue-path.md) | `[P]` | 6.1 | ✅ done (2026-08-10) |
| 6.4 | [T-M4-04 — core command loop](M4/T-M4-04-command-loop.md) | `[P]` | 6.2 | ✅ done (2026-08-10) |
| 6.5 | [T-M4-05 — resolution + project preflight](M4/T-M4-05-resolution-preflight.md) | `[P]` | 6.2 | ✅ done (2026-08-10) |
| 6.6 | [T-M4-06 — run status reporting + `G-4`](M4/T-M4-06-run-status.md) | `[C]` | 6.2 | ✅ done (2026-08-10) |
| 6.7 | [T-M4-07 — UI: blocked actions + snapshot toggle](M4/T-M4-07-ui-blocked-and-toggle.md) | `[P]` | 6.1 | ✅ done (2026-08-11) |
| 6.8 | [T-M4-08 — verification](M4/T-M4-08-verification.md) | `[S]` | 6.1–6.7 | ✅ done (staging, 2026-08-11) |

6.1 and 6.2 are `[S]` for the same reason M3's first two were: they define the
SQL and HTTP contracts every other task is written against. 6.3 and 6.7 need only
the RPCs, so the whole web/UI half can be built in parallel with the daemon half.
6.6 is `[C]` rather than `[P]` because it edits `run-manager.ts` and
`packages/core/src/index.ts`, which 6.4 also touches.

**M4 closes three [`../KnownGaps.md`](../KnownGaps.md) entries.** Not extra
scope — M4 is simply the first phase in a position to close them, and each has an
owning task:

- **`G-3`** — the WIP snapshot has never been fired by a real run, because until
  M4 there is no dispatched work to fire it. Asserted in **6.8 §B**, not left
  incidental. A backup that silently never runs is the one failure mode this
  feature cannot survive.
- **`G-4`** — the snapshot/scheduler race. Closed in **6.6** by holding the busy
  key across the snapshot; M4's dispatch makes concurrent same-project runs
  materially more likely, which is what changed the trade.
- **`G-6`** — the per-runtime snapshot toggle. Closed in **6.7** via the
  `settings.set` command, in the Machines card rather than workspace settings.

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

Phase spec: [`M8/README.md`](M8/README.md).

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 10.1 | [T-M8-01 — `machineState()` in shared](M8/T-M8-01-machine-state.md) | `[S]` | — | ✅ done (2026-08-18) |
| 10.2 | [T-M8-02 — promote the card to a page](M8/T-M8-02-machines-page.md) | `[S]` | 10.1 | ✅ done (2026-08-20) |
| 10.3 | [T-M8-03 — route, sidebar, nav metadata](M8/T-M8-03-route-and-nav.md) | `[P]` | 10.2 | ✅ done (2026-08-20) |
| 10.4 | [T-M8-04 — fix the CLI's pairing path](M8/T-M8-04-cli-path-strings.md) | `[P]` | — | ✅ done (2026-08-18) |
| 10.5 | [T-M8-05 — verification](M8/T-M8-05-verification.md) | `[S]` | 10.1–10.4 | ✅ done (2026-08-20) |

10.1 and 10.2 are `[S]` for the reason M3's and M4's first tasks were: 10.1
defines the vocabulary 10.2 renders, and 10.2 moves a file `settings.tsx`
imports — create, delete and settings edit must land together or the tree does
not build between them. 10.4 is `[P]` with no dependency at all: it edits
strings in `packages/core/src/cli/pair.ts` that name a destination 10.3
registers, but it does not import it.

**Band 10 closes [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)**
in 10.4 — the CLI has always sent users to a tab that does not exist, and this
band moves the destination anyway. **Closed for real on 2026-08-20**: 10.3
registered the page the CLI names, and `sparstrow pair --help` was run against
it.

**Band 10 completed 2026-08-20.** 10.2, 10.3 and 10.5 had been held for the
design-system rebuild; the hold was lifted once `DESIGN.md` existed, because the
only rebuild work still outstanding is `G-19` (parametric `globals.css`) and this
page uses no token it touches. 10.5 was the first **rendered** verification pass
in this repo's history — see its Result for the method, and for the four defects
it caught that 1044 passing tests could not.

### Band 11 — M9 workspace and profile identity · **foundational**

Phase spec: [`M9/README.md`](M9/README.md).

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 11.1 | [T-M9-01 — schema, and a bootstrap that invents nothing](M9/T-M9-01-schema-and-bootstrap.md) | `[S]` | — | ✅ done (staging, 2026-08-18) |
| 11.2 | [T-M9-02 — workspace read + update](M9/T-M9-02-workspace-handler.md) | `[P]` | 11.1 | ✅ done (2026-08-18) |
| 11.3 | [T-M9-03 — profile read + update](M9/T-M9-03-profile-handler.md) | `[P]` | 11.1 | ✅ done (2026-08-18) |
| 11.4 | [T-M9-04 — avatar and logo upload](M9/T-M9-04-image-upload.md) | `[P]` | 11.1 | ✅ done (2026-08-20) |
| 11.5 | [T-M9-05 — hooks](M9/T-M9-05-hooks.md) | `[C]` | 11.2, 11.3 | ✅ done (2026-08-18) |
| 11.6 | [T-M9-06 — verification](M9/T-M9-06-verification.md) | `[S]` | 11.1–11.5 | 🟡 SQL layer done; HTTP layer + 2nd account remain |

11.1 is `[S]` and gates the band: it adds the three missing columns and rewrites
`bootstrap_workspace` to stop inventing a person's name and a workspace's name
(spec decision 6). Everything else is written against that. 11.2, 11.3 and 11.4
are three disjoint pieces of new work — hand them to three workers. 11.5 is
`[C]` because `packages/ui/src/api/hooks.ts` is a ~2100-line file other work
also edits.

**11.4 is the one cuttable task in the plan.** This repo has never used Supabase
Storage, so avatar and logo are genuinely new infrastructure — and neither image
gates a setup step (FR-020). Cut it and both forms still work with the initials
badge the shell already renders; 11.2 and 11.3 then accept only `null` for their
URL fields and 12.2 omits two controls. If it is cut, it needs a
[`../Deferred.md`](../Deferred.md) entry — a cut feature with no record is
indistinguishable from one nobody thought of.

### Band 12 — M10 the setup guide · **serves US2**

Phase spec: [`M10/README.md`](M10/README.md). **Depends on band 11.**

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 12.1 | [T-M10-01 — `setupSteps()` derivation](M10/T-M10-01-derivation.md) | `[S]` | — | ✅ done (2026-08-20) |
| 12.2 | [T-M10-02 — the two setup forms](M10/T-M10-02-setup-forms.md) | `[P]` | 11.6 | ✅ done (2026-08-20) |
| 12.3 | [T-M10-03 — `/setup` page and route](M10/T-M10-03-setup-page.md) | `[C]` | 12.1, 12.2 | ✅ done (2026-08-20) |
| 12.4 | [T-M10-04 — dashboard card + workspace name in the shell](M10/T-M10-04-dashboard-and-shell.md) | `[C]` | 12.1 | ✅ done (2026-08-20) |
| 12.5 | [T-M10-05 — verification](M10/T-M10-05-verification.md) | `[S]` | 12.1–12.4 | 🟡 partly done (2026-08-20) — scenario 11 + form-level micro-behaviours open as `G-25`/`G-26` |

12.1 is `[S]` — every other task renders what it decides, and it is the one
piece of this band provable without a browser. 12.3 and 12.4 are `[C]` against
each other: both edit `nav-meta.ts` and both consume 12.1.

Band 12 soft-depends on band 10 for the machines step's link target. It can be
built before M8 lands; it cannot be *verified* before it.

### Band 13 — M11 walk the spec against staging · **serves US3–US5**

Phase spec: [`M11/README.md`](M11/README.md). **Depends on bands 10 and 12, and
on an owner action.**

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 13.1 | [T-M11-01 — a machine on staging, and both states](M11/T-M11-01-machine-on-staging.md) | `[S]` | owner action | ✅ done (2026-08-22) |
| 13.2 | [T-M11-02 — a run, live](M11/T-M11-02-run-live.md) | `[C]` | 13.1 | done except residue (2026-08-22) |
| 13.3 | [T-M11-03 — the four failure messages](M11/T-M11-03-failure-messages.md) | `[C]` | 13.1 | ✅ done (2026-08-22) |
| 13.4 | [T-M11-04 — the desktop window](M11/T-M11-04-desktop-window.md) | `[P]` | 13.1 | done except residue (2026-08-22) |
| 13.5 | [T-M11-05 — reconcile the gaps](M11/T-M11-05-gap-reconciliation.md) | `[S]` | 13.1–13.4 | ✅ done (2026-08-22) |

13.2 and 13.3 are `[C]` rather than `[P]` because they drive the same machine
and the same workspace — and **13.3 must run after 13.2**, since it revokes a
token 13.2 needs.

**Band 13 is the verification pass `G-12`, `G-13` and `G-16` have been waiting
for.** It is not a new checklist alongside them: 13.5 closes or rewrites each in
place, which is SC-007. It is also blocked in a way no other band is — a
machine's `SPARSTROW_CLOUD_URL` must point at `staging.sparstrow.com`, and until
someone does that, nothing in the band can start. See
[`../runbooks/README.md`](../runbooks/README.md).

---

### Band 4b — auth completeness (2026-08-10)

Raised by the owner after M2 closed: logout and account deletion did not exist,
the OAuth buttons were decorative, and the login page was off-design.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 4.2 | Auth hardening, logout, account deletion, login redesign | `[S]` | 4.1 | done |

Social sign-in is built but not switched on: enabling it needs OAuth apps
registered under the owner's own GitHub and Google accounts. Parked as
[D-8](../Deferred.md) on 2026-08-10 with the runbook ready
([`doc/runbooks/oauth-providers.md`](../runbooks/oauth-providers.md)).

Magic-link sign-in was added on 2026-08-10 at the owner's request, after the
mechanism was explained. It is live and verified end to end.

### Band 14 — D1 design token conformance (2026-08-19)

Raised by the first `slop-audit` run: 228 hardcoded Tailwind palette classes
across 23 files, against a `DESIGN.md` §12 rule that already forbade them. The
checker that should have caught it named nothing and has been retired
(`DD-009`). Runs independently of every band currently queued, but it is a hard
precondition for **band 15** — see there.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 14.1 | [T-D1-01 — status colour token sweep](D1/T-D1-01-status-colour-token-sweep.md) | `[C]` | — | ✅ done 2026-08-19 |

All 228 replacements are actionable. The ~20 that were parked — actor identity
hues and the approval state — were neither brand, status, nor provider identity,
so they needed a doctrine decision. Answered 2026-08-19: `DESIGN.md` gains a
fourth colour role (§2.5 actor identity) and a fifth status (§2.4 approval).

The 97 arbitrary type sizes the same audit found are **not** in this band. The
§3 type scale has no CSS counterpart yet, so sweeping them would mean inventing
tokens mid-sweep — the failure `G-18` describes. Unparks when the scale ships.

### Band 15 — D2 parametric theming (2026-08-19) · ✅ **done**

Plan: [`../plans/2026-08-19-parametric-theming.md`](../plans/2026-08-19-parametric-theming.md).
Closes `G-19` and `G-21` — `DESIGN.md` §2 specifies a theming contract the app
does not have, and its published contrast figures were not reproducible from the
document until this plan's research settled the method.

**Runs strictly after band 14.** Not a preference: 228 hardcoded palette classes
do not read tokens, so rebuilding `globals.css` parametrically first would leave
every one of them wearing the old neutral palette on a themed surface.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 15.1 | [T-D2-01 — the constants, and the floor as a test](D2/T-D2-01-contrast-checker.md) | `[S]` | — | ✅ done 2026-08-19 |
| 15.2 | [T-D2-02 — globals.css derives instead of transcribing](D2/T-D2-02-parametric-globals.md) | `[S]` | 15.1 | ✅ done 2026-08-19 |
| 15.3 | [T-D2-03 — approval, identity, the avatar](D2/T-D2-03-approval-and-identity.md) | `[S]` | 15.2 | ✅ done 2026-08-19 |

`G-19` and `G-21` are both deleted from `KnownGaps.md` with their proof named.
`G-22` opened in their place: the colour system is verified by 250 unit tests, a
clean build, and the design-system viewer, but `apps/web` itself has never been
rendered with it — that needs Supabase credentials, same as `G-16`.

Band 14 was specified to land strictly before this one. It did land first, but
in the same push rather than in a separate one; the reasoning was about the
visible result, and it is recorded in `D2/README.md` rather than left to look
like a skipped step.

**`D-17`, the theme picker, is unparked by this.** Its dependency was `G-19`.
What it still needs is a `product-requirements` pass, not more mechanism.


### Band 16 - Settings Redesign & Theme Architecture (2026-08-22)

Plan: [../plans/2026-08-22-SettingsRedesign.md](../plans/2026-08-22-SettingsRedesign.md).
Unparks D-17 (Theme picker). Resolves the nested tabs layout into a cleaner Master-Detail sidebar, and implements the DESIGN.md §2 theming contract with a Next.js cookie cache to prevent FOUC.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 16.1 | [T-01 - Theme Infra](SettingsRedesign/T-01-ThemeInfra.md) | `[S]` | - | 🟢 done |
| 16.2 | [T-02 - Unified Nav](SettingsRedesign/T-02-UnifiedNav.md) | `[P]` | - | 🟢 done |
| 16.3 | [T-03 - Appearance Picker](SettingsRedesign/T-03-AppearancePicker.md) | `[S]` | 16.1, 16.2 | 🟢 done |

### Band 17 — G23 shared sidebar nav groups (2026-08-23)

Plan: [../plans/2026-08-23-shared-nav-groups.md](../plans/2026-08-23-shared-nav-groups.md).
Narrows `G-23`: both app shells hardcoded their own `NAV_GROUPS` literal, so a
destination added to one silently never appears in the other's sidebar — with
a green typecheck and passing tests. Closes the silent-failure half of the
gap by moving grouping/order into `nav-meta.ts`; the full-shell-merge half
stays open.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 17.1 | [T-G23-01 — extract NAV_GROUPS into nav-meta.ts](G23/T-G23-01-shared-nav-groups.md) | `[S]` | — | ✅ done 2026-08-23 |

### Band 18 — M12–M15 chat message sending (2026-08-23)

Plan: [`../plans/2026-08-23-chat-message-sending.md`](../plans/2026-08-23-chat-message-sending.md).
Spec: [`../specs/2026-08-23-chat-message-sending.md`](../specs/2026-08-23-chat-message-sending.md).
Fixes the stale "Arriving in M5" stub promise on `POST /chat/sessions/:id/messages`
and `.../retry` by actually scoping and building the feature — see
[`BUG-2026-08-23-chat-stub-stale-m5-promise`](../bug/BUG-2026-08-23-chat-stub-stale-m5-promise.md).
Reuses M4's command spine and M5's ingest-then-broadcast shape wholesale
(DD-1); does **not** build the push-based Realtime doorbell parked in
[D-12](../Deferred.md), which named "interactive chat turns" as a candidate
trigger and deliberately did not become one.

Renumbered from a first-drafted Band 17 to Band 18 when this branch merged
`development`: Band 17 above (G-23) landed first and already owned that
number — this note exists so a reader who remembers "chat was Band 17" from
an earlier read of this file isn't confused by the shift; nothing about the
work itself changed.

M12 is fully decomposed (6 tasks) and **complete** — verified live locally
against this branch's real code and real staging Postgres (T-M12-06). **M13 is
now built and verified too** (5 tasks, 2026-08-23), written against M12's
actual shipped shape rather than the plan's outline — which is what this
repo's own precedent asks for (M5's decomposition depended on what M4's
dispatch actually turned out to look like) and which is why it waited. T-M13-05
found and fixed a defect that had made the entire cloud chat UI non-functional
(`GET /chat/sessions/:id`'s response shape didn't match what `chat.tsx` reads)
— caught only because that pass walked a real session through the actual
browser rather than proving the pipe via HTTP/SQL the way M11 and T-M12-06 had
to. M13 is done except the pieces a real successful AI completion would prove
(`G-31` — no usable Anthropic credentials in this sandbox, the same blocker
M12's own pass hit). M14 and M15 stay outlined only, building on the rendering
seam M13 now has.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 18.1 | [T-M12-01 — schema, RLS, enqueue/assign functions](M12/T-M12-01-schema-and-dispatch-functions.md) | `[S]` | — | ✅ done 2026-08-23 — applied and verified live on staging (`pnymngoqseltgigcfevq`) via the Supabase MCP once the owner completed its OAuth login |
| 18.2 | [T-M12-02 — shared contracts and constants](M12/T-M12-02-shared-contracts.md) | `[S]` | 18.1 | ✅ done 2026-08-23 (built against T-M12-01's fully-specified design ahead of that migration's live execution, which was blocked on Supabase MCP auth — pure TypeScript, no live DB dependency) |
| 18.3 | [T-M12-03 — daemon-facing routes + broadcast policy](M12/T-M12-03-daemon-routes-and-broadcast.md) | `[P]` | 18.2 | ✅ done 2026-08-23 — HTTP contract closed live by T-M12-06 |
| 18.4 | [T-M12-04 — core command-loop case + turn executor](M12/T-M12-04-core-chat-turn-executor.md) | `[P]` | 18.2 | ✅ done 2026-08-23 — dispatch chain closed live by T-M12-06 (G-30) |
| 18.5 | [T-M12-05 — `LiveEventSource.subscribeChat`](M12/T-M12-05-live-event-source-chat.md) | `[S]` | 18.3 | ✅ done 2026-08-23 |
| 18.6 | [T-M12-06 — M12 verification](M12/T-M12-06-verification.md) | `[S]` | 18.1–18.5 | ✅ done 2026-08-23 — **M12 complete**, live-verified locally against this branch's real code + real staging Postgres; remaining gaps in `KnownGaps.md` `G-31` |
| 18.7 | [T-M13-01 — `ChatTurnState` at the browser boundary](M13/T-M13-01-turn-state-and-v1-routes.md) | `[S]` | 18.6 | ✅ done 2026-08-23 |
| 18.8 | [T-M13-02 — the local host answers in the same shape](M13/T-M13-02-local-host-turn-state.md) | `[P]` | 18.6 | ✅ done 2026-08-23 |
| 18.9 | [T-M13-03 — hooks split, and `chat.tsx` renders a turn](M13/T-M13-03-chat-page-turn-rendering.md) | `[S]` | 18.7, 18.8 | ✅ done 2026-08-23 |
| 18.10 | [T-M13-04 — Knowledge Center pass](M13/T-M13-04-knowledge-center.md) | `[P]` | 18.7, 18.9 | ✅ done 2026-08-23 |
| 18.11 | [T-M13-05 — M13 verification](M13/T-M13-05-verification.md) | `[S]` | 18.7–18.10 | ✅ done 2026-08-24 — SC-001/SC-004 closed live, last credential-blocked pieces — [`G-31`](../KnownGaps.md) |
| 18.12 | [T-M14-01 — three waiting-reason cards, and TTL-expiry told apart from a real failure](M14/T-M14-01-waiting-reason-cards.md) | `[S]` | 18.11 | ✅ done 2026-08-23 |
| 18.13 | [T-M14-02 — the Knowledge Center names the specific waiting states and the 24h wait](M14/T-M14-02-knowledge-center.md) | `[P]` | 18.11 | ✅ done 2026-08-23 |
| 18.14 | [T-M14-03 — M14 verification](M14/T-M14-03-verification.md) | `[S]` | 18.12, 18.13 | ✅ done 2026-08-24 (scenario 2b closed live) |
| 18.16 | [T-M15-01 — retry affordance on succeeded and failed turns, with a model picker](M15/T-M15-01-retry-affordance.md) | `[S]` | 18.14 | ✅ done 2026-08-23 |
| 18.17 | [T-M15-02 — the Knowledge Center says a reply can be retried](M15/T-M15-02-knowledge-center.md) | `[P]` | 18.14 | ✅ done 2026-08-23 |
| 18.18 | [T-M15-03 — M15 verification](M15/T-M15-03-verification.md) | `[S]` | 18.16, 18.17 | ✅ done 2026-08-24 (retry-twice closed live) |

18.3 and 18.4 are `[P]`: 18.3 touches `apps/web/*` and a new SQL policy file,
18.4 touches `packages/core/*` — zero file overlap, both need only 18.2's
shared types.

**M13 decomposed 2026-08-23** (rows 18.7–18.11), which pushed M14 and M15 from
18.8/18.9 to 18.12/18.13 — both were still `queued` and undecomposed, so
resequencing them is exactly what this file's own "regenerated, not appended"
rule asks for. 18.7 and 18.8 are `[P]` against each other for the same reason
18.3/18.4 were: `apps/web/*` versus `packages/core/*`, both compiling against
shared types that already exist. 18.9 is `[S]` because it edits `hooks.ts` and
`chat.tsx` — and `chat.tsx` is **concurrently being rewritten** in the
`chat-context-menu-design-0eb2ff` worktree (~205 lines), which also touches
`chat-and-inbox.md` that 18.10 edits. Check `development` before starting
either.

**M13 retires both chat stubs, not just `/messages`** — the reasoning is in
[`M13/README.md`](M13/README.md), and it does **not** move retry's user-facing
work out of M15. Decomposition also found that `agent-create.tsx` shares all
three chat hooks with `chat.tsx`, which narrows the plan's DD-7; see
[T-M13-02](M13/T-M13-02-local-host-turn-state.md) decision 1.

**M14 decomposed 2026-08-23** (rows 18.12–18.14), which pushed M15 from 18.13
to 18.15 — same resequencing rule as M13's decomposition above. M14 needed no
new backend work at all: `waitingReason`'s three values were already computed
by M12's `assign_or_park_chat_turn` and already on the wire, unused since
M13 shipped only one generic waiting card — see
[`M14/README.md`](M14/README.md)'s "shape of what was found". `chat.tsx` is
still the file the `chat-context-menu-design-0eb2ff` worktree is rewriting
(unmerged as of this decomposition) — same check-`development`-first caveat
as 18.9 above applies to 18.12.

**M14 built and live-verified 2026-08-23** (rows 18.12–18.14), against
staging through this branch's own preview and the Playwright MCP — all four
card states (three waiting reasons plus TTL-expiry) confirmed rendering
correctly with a clean console, in light/dark and Paper/Mono. One scenario
(2b, a waiting turn resolving once a genuinely-offline machine comes back
online) needed a working credential to close; see below.

**M15 decomposed AND built 2026-08-23** (rows 18.16–18.18), which
renumbered from the single placeholder row 18.15. Same finding pattern as
M13 and M14: no new backend work needed — `retry_chat_turn` already
supports both source statuses and an optional provider/model override, and
already preserves the original reply by always inserting a new row. This
phase added the missing UI piece: `RetryControls`, a retry affordance on a
*succeeded* turn (none existed before) with a real model picker, since
`TurnErrorBanner`'s existing `fallback` field is dead on the cloud path.
Live-verified end to end on staging, including reading the resulting DB row
back to confirm the picker's selection actually reached `retry_chat_turn`,
not just that the UI re-rendered. See [`M15/README.md`](M15/README.md)'s
"shape of what was found". `chat.tsx` was still the contended file at
build time (same `chat-context-menu-design-0eb2ff` caveat as 18.12 above).

**Credential fix closed both remaining gaps live, 2026-08-24.** The owner
ran `claude setup-token` (`D-21`, formerly tracked as `G-32`), and this
agent restarted the real daemon with the resulting token and confirmed,
through the real app on the owner's real account: a genuine chat
completion, retry with a different model twice in sequence (M15's
remaining gap, formerly `G-34`), and the offline→online transition (M14's
scenario 2b, formerly `G-33`) — the real daemon was stopped, a message sent
while it was down, then restarted, and the SAME turn resolved automatically
with no resend. Full evidence in `KnownGaps.md`'s `G-31` "Closed, live"
note. Both phases' plans are now fully built and verified.

**SC-001 and SC-004 closed live, 2026-08-24, completing the plan.** The two
verification criteria still open after the credential fix — a visibly
growing reply across ≥2 broadcasts, and Project/Agent replies being
observably distinctive rather than generic — were walked with a
purpose-built scratch project and agent in the real account, both cleaned
up afterward. `reply_seq` advanced 1→3 with the text growing 142→327 chars
in one turn; a Project session correctly cited two marker facts a parallel
Free session couldn't know; an agent on a non-default model (`opus`)
replied correctly in its configured persona and `chat_turns` recorded that
model, not the session default. Full evidence in `KnownGaps.md`'s `G-31`.
The plan's own Status is now `✅ Completed` — the only thing left in `G-31`
is the two-online-machines race, an accepted residual shared with
`G-15`/`G-24`, not a blocker.

### Band 19 — VR retire the Vite app (2026-08-24)

Plan: [`../plans/2026-08-24-retire-the-vite-app.md`](../plans/2026-08-24-retire-the-vite-app.md).
Spec: n/a (internal). Phase spec: [`VR/README.md`](VR/README.md).

The owner's stated current priority, ahead of new features and the access
model. Executes [`D-24`](../Deferred.md): one Next.js UI, Electron as a shell,
`packages/ui` narrowed to a design system.

**This band removes working features, deliberately.** Core implements 31
handlers — terminals, folder browsing, project git, the code graph, provider
settings, local skill import — that `apps/web` stubs with a 501, and the Vite
app is the only UI that can reach them. The plan's decision 1 records why that
loss is accepted and the condition that would reverse it. The rebuild is
[`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md),
pending owner review — **not** part of this band.

Every task is `[S]`. This is one sequence through one set of files, and two
agents in `packages/ui` at once would conflict on nearly every file. Fully
decomposed 2026-08-24 — six tasks, all written.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 19.1 | [T-VR-01 — delete the Vite host](VR/T-VR-01-delete-vite-host.md) | `[S]` | — | ✅ done (2026-08-24) |
| 19.2 | [T-VR-02 — move the pages](VR/T-VR-02-move-pages.md) | `[S]` | 19.1 | ✅ done (2026-08-24) |
| 19.3 | [T-VR-03 — move the app-code components](VR/T-VR-03-move-components.md) | `[S]` | 19.2 | ✅ done (2026-08-24) |
| 19.4 | [T-VR-04 — un-shim, and delete the shim](VR/T-VR-04-unshim.md) | `[S]` | 19.3 | ✅ done (2026-08-24) |
| 19.5 | [T-VR-05 — one worked Server Component](VR/T-VR-05-server-component.md) | `[S]` | 19.4 | ✅ done (2026-08-24) |
| 19.6 | [T-VR-06 — verification](VR/T-VR-06-verification.md) | `[S]` | 19.1–19.5, 19.7 | ✅ done (2026-08-24) |
| 19.7 | [T-VR-07 — finish narrowing `packages/ui`](VR/T-VR-07-narrow-packages-ui.md) | `[S]` | 19.4 | ✅ done (2026-08-24) |

**Runs against nothing else.** Band 18 is complete, and the two open specs
(machine-reaching, access model) are both pre-review, so nothing is in flight
to conflict with. Any new work touching `packages/ui` or `apps/web/src/app`
must wait for this band rather than run `[P]` alongside it — the file overlap
is total.

**19.3 filed, 19.7 resolved [`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](../bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md)** — the hosted app never loaded the typeface `DESIGN.md` mandates. Pre-existing; fixed once the correct import location settled at `T-VR-07`.

**19.7 filed and fixed [`BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`](../bug/BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank.md)** — the same failure shape as the typeface bug, found while classifying `packages/ui`: `lib/knowledge.ts`'s Vite-only `import.meta.glob` had silently returned an empty registry since `T-VR-01`, so Knowledge Center breadcrumbs/tabs showed a raw slug instead of the article title.

**Band complete 2026-08-24.** 19.6 ran the full pass against the feature
branch's own Vercel preview with real credentials — all 26 routes, all six
switched-off areas, the T-VR-05 Server Component's SSR delivery confirmed by
`curl`ing the raw HTML with the session cookie. **19.6 filed, then fixed
outside the band, [`BUG-2026-08-24-project-provision-always-400s`](../bug/BUG-2026-08-24-project-provision-always-400s.md)**
(🟢 resolved) — pre-existing, unrelated to this band, found while trying to
seed a real project for the verification walk: every "New project" creation
path 400s unconditionally. `POST /projects/provision` spread client-only
fields into the DB insert and never generated a `slug`, the exact gap
`BUG-2026-08-22-team-create-500-missing-slug` fixed on the sibling handler
but not this one; fixed by mirroring that fix, verified live end-to-end
through the actual dialog. 19.6 also closed [`G-23`](../KnownGaps.md) (both
remaining halves resolved by this band) and opened [`G-36`](../KnownGaps.md)
(Electron's offline screen typechecked, never rendered — no display
environment available to verify it live).

**19.1 partially fixed [`BUG-2026-08-22-core-tests-flake-under-turbo-parallelism`](../bug/BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md)**,
which was marked resolved: the package-level timeout fix does not cover a file
that sets its own *lower* per-test timeout. That override is removed; the
underlying CPU-oversubscription cause (five suites' worker pools contending
under `turbo run test`) is deliberately left open — see the bug for why.

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
