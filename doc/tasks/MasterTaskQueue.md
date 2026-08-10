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

### Band 5+ — not yet decomposed

Scoped in `doc/plans/2026-08-09-daemon-cloud-control-plane.md`; task files are
written when the band is next. M4's spec depends on what M3's pairing flow
actually looks like, so writing it now would be fiction.

| # | Phase | Tag | Depends on | Status |
|---|---|---|---|---|
| 5.x | M3 — pairing, registration, heartbeat | `[S]` | M2 | not decomposed |
| 6.x | M4 — command spine (claim/lease/ack) | `[S]` | M3 | not decomposed |
| 7.x | M5 — transcripts (dual path) | `[P]` | M4 | not decomposed |
| 7.y | M6 — memory sync | `[P]` | M4 | not decomposed |
| 7.z | M7 — route parity + Electron hosted load | `[P]` | M2 | not decomposed |

M5, M6 and M7 are `[P]` against each other: transcripts, memory sync, and the
Electron shell touch disjoint files and can be built by different workers once
their prerequisites land. M7 needs only M2, so it can start early if M3/M4 stall.

---

### Band 4b — auth completeness (2026-08-10)

Raised by the owner after M2 closed: logout and account deletion did not exist,
the OAuth buttons were decorative, and the login page was off-design.

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 4.2 | Auth hardening, logout, account deletion, login redesign | `[S]` | 4.1 | done except provider enablement |

Provider enablement is the owner's to do — it means creating OAuth apps on
GitHub and Google and pasting client secrets into the Supabase dashboard.
Runbook: [`doc/runbooks/oauth-providers.md`](../runbooks/oauth-providers.md).

## Blocked items

| Item | Blocked by | Effect |
|---|---|---|
| GitHub / Google sign-in | Owner action | Code is complete and verified; both providers report `enabled: false` in Supabase, so the buttons render disabled with an explanation. Follow the runbook and they light up with no code change. |
| Leaked password protection | **Supabase plan** | Requires Pro; not available on the current plan (confirmed 2026-08-10). No SQL equivalent, so nothing in this repo can fix it. Verified off by signing up with `password123` and getting a session. Not an action item — the advisor will keep flagging it. |
| `/runs/[runId]` render + Realtime refetch | M4 | Both need a run to exist. Nothing to open until dispatch creates one. |

`OQ-1` (protecting uncommitted agent work) is open but blocks nothing in the
current queue — it becomes relevant during M4, when agents start running
unattended from cloud dispatch.

`OQ-2` (how an agent completes a browser pass) no longer blocks anything: the
M2 pass ran on 2026-08-10 using a session that was already live in the browser.
It is still unanswered as a *method*, and will bite again in M5.
