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

### Band 10 — M8 Machines gets a menu of its own · **serves US1**

Phase spec: [`M8/README.md`](M8/README.md).

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 10.1 | [T-M8-01 — `machineState()` in shared](M8/T-M8-01-machine-state.md) | `[S]` | — | queued |
| 10.2 | [T-M8-02 — promote the card to a page](M8/T-M8-02-machines-page.md) | `[S]` | 10.1 | queued |
| 10.3 | [T-M8-03 — route, sidebar, nav metadata](M8/T-M8-03-route-and-nav.md) | `[P]` | 10.2 | queued |
| 10.4 | [T-M8-04 — fix the CLI's pairing path](M8/T-M8-04-cli-path-strings.md) | `[P]` | — | queued |
| 10.5 | [T-M8-05 — verification](M8/T-M8-05-verification.md) | `[S]` | 10.1–10.4 | queued |

10.1 and 10.2 are `[S]` for the reason M3's and M4's first tasks were: 10.1
defines the vocabulary 10.2 renders, and 10.2 moves a file `settings.tsx`
imports — create, delete and settings edit must land together or the tree does
not build between them. 10.4 is `[P]` with no dependency at all: it edits
strings in `packages/core/src/cli/pair.ts` that name a destination 10.3
registers, but it does not import it.

**Band 10 closes [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)**
in 10.4 — the CLI has always sent users to a tab that does not exist, and this
band moves the destination anyway.

### Band 11 — M9 workspace and profile identity · **foundational**

Phase spec: [`M9/README.md`](M9/README.md).

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 11.1 | [T-M9-01 — schema, and a bootstrap that invents nothing](M9/T-M9-01-schema-and-bootstrap.md) | `[S]` | — | queued |
| 11.2 | [T-M9-02 — workspace read + update](M9/T-M9-02-workspace-handler.md) | `[P]` | 11.1 | queued |
| 11.3 | [T-M9-03 — profile read + update](M9/T-M9-03-profile-handler.md) | `[P]` | 11.1 | queued |
| 11.4 | [T-M9-04 — avatar and logo upload](M9/T-M9-04-image-upload.md) | `[P]` | 11.1 | queued |
| 11.5 | [T-M9-05 — hooks](M9/T-M9-05-hooks.md) | `[C]` | 11.2, 11.3 | queued |
| 11.6 | [T-M9-06 — verification](M9/T-M9-06-verification.md) | `[S]` | 11.1–11.5 | queued |

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
| 12.1 | [T-M10-01 — `setupSteps()` derivation](M10/T-M10-01-derivation.md) | `[S]` | — | queued |
| 12.2 | [T-M10-02 — the two setup forms](M10/T-M10-02-setup-forms.md) | `[P]` | 11.6 | queued |
| 12.3 | [T-M10-03 — `/setup` page and route](M10/T-M10-03-setup-page.md) | `[C]` | 12.1, 12.2 | queued |
| 12.4 | [T-M10-04 — dashboard card + workspace name in the shell](M10/T-M10-04-dashboard-and-shell.md) | `[C]` | 12.1 | queued |
| 12.5 | [T-M10-05 — verification](M10/T-M10-05-verification.md) | `[S]` | 12.1–12.4 | queued |

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
| 13.1 | [T-M11-01 — a machine on staging, and both states](M11/T-M11-01-machine-on-staging.md) | `[S]` | owner action | blocked — owner action |
| 13.2 | [T-M11-02 — a run, live](M11/T-M11-02-run-live.md) | `[C]` | 13.1 | queued |
| 13.3 | [T-M11-03 — the four failure messages](M11/T-M11-03-failure-messages.md) | `[C]` | 13.1 | queued |
| 13.4 | [T-M11-04 — the desktop window](M11/T-M11-04-desktop-window.md) | `[P]` | 13.1 | queued |
| 13.5 | [T-M11-05 — reconcile the gaps](M11/T-M11-05-gap-reconciliation.md) | `[S]` | 13.1–13.4 | queued |

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
| 14.1 | [T-D1-01 — status colour token sweep](D1/T-D1-01-status-colour-token-sweep.md) | `[C]` | — | queued, fully unblocked |

All 228 replacements are actionable. The ~20 that were parked — actor identity
hues and the approval state — were neither brand, status, nor provider identity,
so they needed a doctrine decision. Answered 2026-08-19: `DESIGN.md` gains a
fourth colour role (§2.5 actor identity) and a fifth status (§2.4 approval).

The 97 arbitrary type sizes the same audit found are **not** in this band. The
§3 type scale has no CSS counterpart yet, so sweeping them would mean inventing
tokens mid-sweep — the failure `G-18` describes. Unparks when the scale ships.

### Band 15 — D2 parametric theming (2026-08-19) · **not decomposed yet**

Plan: [`../plans/2026-08-19-parametric-theming.md`](../plans/2026-08-19-parametric-theming.md).
Closes `G-19` and `G-21` — `DESIGN.md` §2 specifies a theming contract the app
does not have, and its published contrast figures were not reproducible from the
document until this plan's research settled the method.

**Runs strictly after band 14.** Not a preference: 228 hardcoded palette classes
do not read tokens, so rebuilding `globals.css` parametrically first would leave
every one of them wearing the old neutral palette on a themed surface.

Three phases when decomposed — D2.1 the contrast checker and measurement basis
(foundational), D2.2 parametric `globals.css`, D2.3 approval status and actor
identity. Tasks are written once the owner accepts the §2.3 lightness
recalibration the plan asks for; D2.1 has a stated fallback if they decline, so
the phase lands either way.

`OQ-4` blocks one sub-item of D2.2 (the `--hl-*` syntax palette) and nothing
else.

## Blocked items

> For a single checklist of everything that needs the owner specifically, see
> [`../runbooks/README.md`](../runbooks/README.md) — the rows below explain
> *why* each is in the queue; that file is where you go to actually act on one.

| Item | Blocked by | Effect |
|---|---|---|
| **M11 (band 13) in its entirety** | **Owner action** — a machine's `SPARSTROW_CLOUD_URL`/`SPARSTROW_APP_URL` pointed at `staging.sparstrow.com` | Hard block, not a slow path. Nothing is undecided; two environment variables and a restart. This is also what unblocks `G-16`'s "everything behind a deployment" bullet and the residue of `T-M7-04` §D. See [`../runbooks/deploy-web-app.md`](../runbooks/deploy-web-app.md). |
| GitHub / Google sign-in | **Deferred → [D-8](../Deferred.md)** | Not blocked work — parked by the owner 2026-08-10. Code is complete and verified; the buttons render disabled and light up on their own once the providers are enabled. |
| Leaked password protection | **Supabase plan** | Requires Pro; not available on the current plan (confirmed 2026-08-10). No SQL equivalent, so nothing in this repo can fix it. Verified off by signing up with `password123` and getting a session. Not an action item — the advisor will keep flagging it. |
| `/runs/[runId]` transcript | M5 (7.6) | M4 made the page openable and the run row live; the transcript inside it is empty until M5 writes `run_events` to the cloud. |
| Realtime doorbell for dispatch | **Deferred → [D-12](../Deferred.md)** | Not blocked work. The 3s poll is correct and always-on; the doorbell is a latency improvement that M5's decision 1 declined to buy with a second daemon auth model. |
| Agent definitions differ between cloud and machine | **Deferred → [D-9](../Deferred.md)** | Not blocked work. M4 resolves a cloud agent to a local one by slug and blocks legibly on a miss; syncing definitions is a separate feature with its own conflict model. |

`OQ-1` (protecting uncommitted agent work) was **answered and built** on
2026-08-10, ahead of M4 rather than inside it — the owner approved the
recommendation, and the feature is small and self-contained enough that shipping
it beat writing a task for it. When a run ends, core snapshots the project's
working tree to `refs/sparstrow/wip/<run-id>` on that machine: not a branch, not
a commit on any branch, never pushed, `.gitignore` respected, and switchable from
Settings. Rationale and the two narrowings from the original option B are settled
decision 5 in the plan. **M4 is no longer gated on anything.**

`OQ-2` (how an agent completes a browser pass) was **answered and closed** on
2026-08-10 during M3, and removed from `OpenQuestions.md`. Restoring magic-link
sign-in made it solvable: an agent mints a one-time token with the Supabase
admin API and navigates to `/auth/confirm` — the product's own sign-in path, no
password typed and no bypass. Procedure:
[`../runbooks/agent-browser-session.md`](../runbooks/agent-browser-session.md).
