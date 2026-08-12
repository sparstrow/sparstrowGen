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
| 7.6 | [T-M5-06 — verification](M5/T-M5-06-verification.md) | `[S]` | 7.1–7.5 | **next** |

7.1 and 7.2 are `[S]` for the third phase running: they define the HTTP and SQL
contracts the other tasks compile against. 7.3 needs only the contract, so the
whole daemon half runs in parallel with the web half. 7.4 is `[C]` rather than
`[P]` because it shares `transcripts.ts` with 7.3.

**M5 does not inherit the Realtime doorbell after all.** M4 deferred it here on
the grounds that M5 must authenticate the daemon to Realtime anyway — and M5's
decision 1 declines to, because the server can broadcast from a route that
already holds the service role and already knows the workspace. The doorbell is
parked as [D-10](../Deferred.md) with what would unpark it.

### Band 8+ — not yet decomposed

Scoped in `doc/plans/2026-08-09-daemon-cloud-control-plane.md`; task files are
written when the band is next.

| # | Phase | Tag | Depends on | Status |
|---|---|---|---|---|
| 8.x | M6 — memory sync | `[P]` | M4 | not decomposed |
| 8.y | M7 — route parity + Electron hosted load | `[P]` | M2 | not decomposed |

M5, M6 and M7 are `[P]` against each other: transcripts, memory sync, and the
Electron shell touch disjoint files and can be built by different workers once
their prerequisites land. M7 needs only M2, so it can start at any time.

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

## Blocked items

> For a single checklist of everything that needs the owner specifically, see
> [`../runbooks/README.md`](../runbooks/README.md) — the rows below explain
> *why* each is in the queue; that file is where you go to actually act on one.

| Item | Blocked by | Effect |
|---|---|---|
| GitHub / Google sign-in | **Deferred → [D-8](../Deferred.md)** | Not blocked work — parked by the owner 2026-08-10. Code is complete and verified; the buttons render disabled and light up on their own once the providers are enabled. |
| Leaked password protection | **Supabase plan** | Requires Pro; not available on the current plan (confirmed 2026-08-10). No SQL equivalent, so nothing in this repo can fix it. Verified off by signing up with `password123` and getting a session. Not an action item — the advisor will keep flagging it. |
| `/runs/[runId]` transcript | M5 (7.6) | M4 made the page openable and the run row live; the transcript inside it is empty until M5 writes `run_events` to the cloud. |
| Realtime doorbell for dispatch | **Deferred → [D-10](../Deferred.md)** | Not blocked work. The 3s poll is correct and always-on; the doorbell is a latency improvement that M5's decision 1 declined to buy with a second daemon auth model. |
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
