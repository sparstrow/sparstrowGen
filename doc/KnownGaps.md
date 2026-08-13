# Known Gaps

Things that are **built but not fully proved**, and limitations we have accepted
knowingly. This is the register an agent reads before trusting that something
works, and before claiming it does.

It exists because the other files each answer a different question and none of
them answer this one:

| File | Holds |
|---|---|
| `OpenQuestions.md` | needs a decision from the owner |
| `Deferred.md` | agreed to build, deliberately not built yet |
| `runbooks/README.md` | only a human can do it (dashboards, secrets, OAuth apps) |
| **`KnownGaps.md`** | **built, but not verified — or verified to be limited** |

## How to use it

**Before relying on something, check whether it is listed here.** A gap entry is
not a bug report; it is a statement about the *strength of the evidence* behind a
piece of working code. `G-12` does not mean the Machines card is broken — it
means nobody has looked at it.

**When you clear one, delete the entry** and say where the proof lives, exactly
like `OpenQuestions.md`. The length of this file is a real signal; a gap that
lingers because closing it was inconvenient is the whole failure mode this file
is meant to prevent.

**When you leave one, add it here in the same change that creates it.** A caveat
mentioned only in a chat message does not exist. If verification was skipped, say
so in the task's Result section *and* open an entry here.

Each entry carries: what is unproved, why it ended up that way, what it would
cost if the assumption is wrong, and the concrete thing that would close it.

---

## Unverified

### G-1 — Ctrl+C graceful shutdown, on Windows

**Raised:** 2026-08-10 (M3, `T-M3-08`).

Core's `draining` declaration on graceful shutdown was verified through
`POST /system/shutdown`. It was **not** verified through a console interrupt,
because Node cannot deliver a real SIGINT to a spawned child on Windows —
`child.kill("SIGINT")` terminates it outright and the handler never runs.

Both paths go through the same `registerShutdownHandler(shutdown)`, and the HTTP
route is what the desktop shell actually calls to stop core on Windows, so the
shared code *is* exercised. What is untested is the signal wiring itself.

- **If wrong:** a developer pressing Ctrl+C leaves a runtime reading `online`
  until `HEARTBEAT_STALE_AFTER` (90s) expires. Cosmetic, and self-correcting.
- **Clears when:** someone runs core in an interactive console, presses Ctrl+C,
  and confirms `shutting down` in the log and `draining` on the row. Two minutes
  of a human's time; no code needed.

### G-2 — The WIP snapshot settings card has never been seen in the UI that owns it

**Raised:** 2026-08-10 (WIP snapshots / OQ-1).

The card was read in the browser against the hosted app and its copy confirmed —
then it was deliberately gated to render **only** in the local, core-served UI
(see `G-6`). The local UI was never booted, so the card has not been observed in
the one place it is active.

The markup is identical in both hosts; the only difference is `account === null`.
Its one piece of logic (`isWipSnapshotEnabled`) is unit-tested in `shared`.

- **If wrong:** the toggle is unreachable or misrendered on the only surface that
  can change it — the feature would still work, silently, at its default.
- **Clears when:** core plus the local UI are booted and someone flips the switch
  and sees it persist.

*`G-3` — the WIP snapshot never having fired from a real run — was **closed
2026-08-11** by M4 (`T-M4-08` §B). A run dispatched from the cloud to this
Windows machine, against a project with a deliberately dirty tree, produced
`refs/sparstrow/wip/run_154b6cc1cbef424a`. The assertions that make it a proof
rather than a sighting: `git status` read identically before and after, HEAD did
not move, the staged/unstaged split survived, the uncommitted modification was
captured, and `.env` and `node_modules/` were **absent** from the tree — the
`.gitignore` guarantee OQ-1 rested on.

Two further things fell out of it. The ref is named with the **cloud's** run id
on local disk, which is decision 4 proved end to end and the thing M5's
transcripts depend on. And turning the snapshot off from the browser genuinely
stops it: a run with the switch off produced no ref and logged nothing.*

### G-12 — Five M4 assertions were proved in SQL or unit tests, not live

**Raised:** 2026-08-11 (M4, `T-M4-08`). The phase is otherwise verified live on
staging; these are the corners that pass could not reach.

- **The browser click-through pass never happened.** The Browser pane did not
  composite frames in this environment, so screenshots and the accessibility
  tree were both unavailable and nothing could be clicked. Every M4 endpoint
  *was* exercised through a real signed-in session from the page's own `fetch`,
  which is what found two of the phase's defects — but no rendered component was
  seen or interacted with. The blocked-task affordance and the Machines-card
  switch have never been looked at.
- **Lease recovery after a mid-claim kill**, two polls racing one row, and the
  five-attempt poison ceiling. All three are proved deterministically against a
  throwaway Postgres by
  `packages/shared/drizzle/policies/verify-command-spine.mjs`; none was
  reproduced live, because each needs a timing window.
- **Reassign** needs a second paired machine, and **clone end-to-end** needs a
  real remote. The routes exist and every clone guard is unit-tested, including
  the non-empty-directory refusal.
- **The unpaired local UI starting a run** was not re-proved. Core served its own
  API throughout this pass, so the surface is not cold — but the specific claim
  "an unpaired machine still works" rests on it being unchanged, not on a test.

- **If wrong:** the most likely failure is cosmetic — a control that renders
  wrong or an affordance that does not appear — because the data paths beneath
  all of them are exercised. The exception is the UI, where M2's browser pass
  found a hook-order crash and a whole class of missing Tailwind utilities that
  no API-level test could see. That precedent is why this entry exists rather
  than a shrug.
- **Clears when:** someone runs the click-through pass in an environment where
  the browser pane renders, and pairs a second machine for reassign.

### G-13 — M5 (transcripts) is built and unit-tested, not verified live

**Raised:** 2026-08-12, while decomposing and building M5. `T-M5-01`–`T-M5-05`
are done — 886 tests green, `pnpm -r typecheck` clean — but `T-M5-06`
(verification) was deferred to the owner rather than run, because most of what
it checks needs things this environment does not have.

- **Live streaming to a second device (T-M5-06 §A)** and **cross-workspace
  isolation on the subscribe side (§E)** both need a second real signed-in
  session — a browser session cannot be two independent workspace members at
  once.
- **The 60-second outage assertion (§B)** — the property M5 is actually judged
  on — needs the daemon's network cut for a minute. That is an OS-level,
  disruptive action on whatever machine runs core, correctly withheld pending
  the owner's say-so rather than done unilaterally.
- **Any rendered pixel.** As `G-12` recorded for M4, the Browser pane has not
  composited frames in this environment; that has not changed. Every M5 UI
  module (`live-events.ts`, `realtime-live-events.ts`, the pagination fix) is
  unit-tested as extracted pure logic — 38 tests — but `run-detail.tsx`'s own
  `useEffect` wiring has never been mounted, not once, in any environment.
  `packages/ui` has no `@testing-library/react` or jsdom to mount it with even
  if a browser did render.
- Crash recovery (T-M5-06 §D) and the durable-count comparison (§C) **are**
  solo-doable — this environment can start core, dispatch a real run, kill and
  restart the process, and compare local SQLite against cloud Postgres counts
  directly. Those were not run either, only because the owner asked to defer
  the whole verification pass rather than a partial one.

- **If wrong:** the shape of failure is the same class T-M5-05's own Result
  section names — the pure logic underneath is right, but nothing has proved
  the framework glue calling it. `M2`'s browser pass found exactly this kind of
  bug once (a hook-order crash, missing Tailwind utilities) that no unit test
  could see, which is why this is a register entry and not a shrug.
- **Clears when:** `T-M5-06` runs for real — a second device or account, a
  genuine network cut on the daemon's machine, and (ideally) a browser pane
  that composites. Full procedure in
  [`tasks/M5/T-M5-06-verification.md`](tasks/M5/T-M5-06-verification.md).

### G-15 — M6 (memory sync) is built and unit-tested; nothing has synced between two real machines

**Raised:** 2026-08-12, closing T-M6-01 … T-M6-04.

The code is complete and 956 tests pass, including the conflict rule from both
directions, the debounce, both sweeps, cursor paging, and the crash-replay path.
**Not one note has travelled between two machines**, because verifying that needs
a second paired machine and this repo has one.

What is genuinely unproved, as opposed to merely untested-in-isolation:

- **The daemon routes themselves.** Both were written; neither has served a
  request. The judgement inside them is extracted and tested
  (`apps/web/src/lib/daemon/memory-sync.test.ts`), but the query-builder calls
  around it — the `.or()` tuple-cursor filter in particular, whose PostgREST
  syntax is asserted only as a STRING — have never touched Postgres.
- **The cross-workspace guard.** The push route reads note ids across workspaces
  precisely so it can refuse foreign ones (phase README, correction B). That
  refusal has never been exercised against a real database, and it is the one
  piece of this phase where being wrong means a cross-tenant write rather than a
  failed sync.
- **The constraint-violation fallback.** Its trigger is a path collision between
  two machines, which cannot be produced with one.
- **Real conflict resolution.** Every last-write-wins test drives the decision
  function directly with constructed timestamps. Two machines actually editing
  the same note while split is a different thing from asserting what
  `decidePush` returns.
- **That another machine ends up able to search a pulled note.** The indexer is
  stubbed in tests; what is proved is that a pulled note is HANDED to it, not
  that the local index comes out usable at the other end.

- **If wrong:** the shape of failure is the one M4 and M5 both hit — the pure
  logic is right and the glue is not. M4 shipped four defects a live pass found;
  M5 shipped two design corrections. There is no reason to expect this phase to
  be the exception, and its blast radius is a user's own writing.
- **Clears when:** [`T-M6-05`](tasks/M6/T-M6-05-verification.md) runs with two
  machines paired to one workspace. Sections A–D need the second machine;
  section E needs a second workspace account; section F can be run today.

### G-11 — Supabase has never been observed delivering an email

**Raised:** 2026-08-10, investigating "I can't create an account, no link arrives".

Every magic link used across M2 and M3 verification was minted with the **admin
API** (`generateLink`), which returns a token and sends no mail. That was the right
tool for an unattended browser pass, and it means the SMTP path was never once
exercised — while both milestones reported their auth verification as passing.

A live `signInWithOtp` to a real inbox was accepted by Supabase (no error), but
acceptance is not delivery, and nothing in this repo can read an inbox.

Sign-**up** is unaffected: "Confirm email" is off, so it needs no mail at all.
Magic-link sign-in and password reset both depend on this entirely.

- **If wrong:** two of the three sign-in routes are dead for everyone, and the
  built-in mailer's rule — deliver **only** to members of the project's Supabase
  org — means it can work for the owner and fail for every invited user, which is
  the worst shape of failure to debug later.
- **Clears when:** an email is confirmed arriving in a real inbox, or custom SMTP
  is configured. Procedure and the "Confirm email" interaction:
  [`runbooks/email-delivery.md`](runbooks/email-delivery.md).

*`G-4` — a concurrent run starting while a snapshot is being taken — was **closed
2026-08-10** by M4 (`T-M4-06`). `finalize()` now holds the busy key across the
snapshot and releases it on every path, including the snapshot throwing. The
trade the gap recorded as declined was re-made rather than ignored: dispatch
makes concurrent same-project runs materially more likely, and the hold costs
one agent+project identity plus one concurrency slot for the duration of bounded
git plumbing. Proof:
`packages/core/src/orchestrator/run-manager-finalize.test.ts` — five cases,
including that a throwing snapshot still releases the key and still hands off,
and that the snapshot precedes handoff.*

---

## Accepted limitations

### G-5 — Untrusted runs are badged, not write-clamped

**Raised:** P5 (EH6/EH7). Already surfaced to users in
`packages/ui/src/content/knowledge/limitations.md`.

`isUntrustedRun()` stamps `runs.untrusted` and memory notes from those runs are
quarantined. There is no general *write* clamp: the strict clamp sandboxes get is
not applied to every untrusted run.

Note the structural reason, which is easy to miss — one of the three signals
(external-content tool use) is only knowable from the finished transcript, so it
**cannot** gate the run that produced it. Only `isSandbox` and `delegated` are
known at spawn and could be clamped there.

- **Clears when:** a spawn-time clamp is built for the two signals that are known
  at spawn. The third can never gate its own run; the quarantine is the mitigation
  for it, by design.

*`G-6` — the WIP snapshot toggle existing only in the local UI — was **closed
2026-08-10** by M4 (`T-M4-07`). The Machines card now carries a per-runtime
switch, driven by an allowlisted `settings.set` command; per-runtime rather than
workspace-wide because a laptop with a small disk and a workstation with a large
one have different right answers.

The part worth recording is what stopped it reopening the same gap in a new
place. The switch renders `runtimes.reported_settings`, which **only the daemon
writes** — at boot and again after it applies a `settings.set`. An optimistic
switch showing what you clicked rather than what happened would have had exactly
the defect G-6 named, wearing a better hat. An offline machine's switch is
disabled and says why, instead of queueing a change against a computer that is
switched off. Because the value is read from the machine's own settings table, a
switch flipped in the local Settings card also shows correctly in the hosted UI.

Proof: `apps/web/src/lib/api/runtime-routes.test.ts` for dispatch and the
allowlist, `packages/core/src/cloud/commands.test.ts` for the daemon-side
allowlist, migration `0002_vengeful_norrin_radd.sql` for the column. The live
flip is `T-M4-08`.*

### G-14 — A run watched from two open tabs opens two Realtime channels

**Raised:** 2026-08-12 (M5, `T-M5-05`), noted while building the Realtime
transcript source rather than discovered afterward.

`RealtimeLiveEventSource.subscribeRun()` opens a fresh private channel per
call, one per mounted `/runs/[runId]` page. Two tabs — or two browser
windows — watching the *same* run each open their own channel to the same
topic; nothing shares or dedupes them. This is a decision, not an unproved
claim: at the scale this phase was measured against (one person, one machine,
one run at a time), a shared-subscription registry would be complexity with
no observed payoff.

- **If wrong:** the cost is one extra Realtime connection per redundant tab,
  not a correctness problem — both tabs still see the same events, since both
  subscribe to the same topic and RLS grants both alike. This becomes worth
  fixing only if `/runs/[runId]` becomes something a team watches together, at
  which point N tabs means N channels for the same broadcast.
- **Clears when:** a shared, refcounted subscription (one channel per
  `runId` process-wide, closed once the last subscriber unmounts) replaces the
  per-call one — worth building when multi-viewer usage is real, not before.

### G-7 — Leaked-password protection is unavailable on the current Supabase plan

Requires Pro; confirmed 2026-08-10 by signing up with `password123` and getting a
session. No SQL equivalent exists, so nothing in this repo can fix it, and the
advisor will keep flagging it. Recorded in full in
[`runbooks/README.md`](runbooks/README.md) and
[`tasks/MasterTaskQueue.md`](tasks/MasterTaskQueue.md) — listed here only so the
register is complete. Magic-link sign-in is a partial mitigation.

### G-8 — `apps/web` still uses `middleware.ts`, deprecated in Next 16

**Raised:** 2026-08-10 (auth work), noted and not acted on.

Next 16 deprecates `middleware` in favour of `proxy`. `apps/web/src/middleware.ts`
works today and carries the session-refresh and API-401 behaviour that M2 fixed.

- **If wrong:** nothing now; it breaks on a future Next major.
- **Clears when:** the rename is done deliberately, with the `/api/` passthrough
  re-verified — that behaviour is load-bearing (it is what makes API calls return
  JSON 401s instead of an HTML login page) and is easy to lose in a mechanical
  port.

---

## Documentation drift

*`G-9` — the in-app knowledge center predating the cloud control plane — was **closed
2026-08-10**. Seven articles were corrected against post-M3 reality and `AGENTS.md`
§3.2 was strengthened, because the rule requiring a Knowledge Center update already
existed and was followed; what it did not cover was a change **falsifying pages it
never opened**. That check is now explicit, and phase completion asserts it.*

### G-10 — Platform quota figures were published without a source

**Raised:** 2026-08-10, while closing `G-9`.

`providers-and-execution-modes.md` carried three precise-sounding limits — 30 auth
requests/minute/IP, 15 pooled connections, 200 concurrent Realtime sockets — with
nothing behind them. They may well be correct; there is no evidence either way, and
they were written as fact.

They have been replaced with "these come from the hosting plan, read them from the
dashboard", which is true and useful. That is a correct answer, not a complete one.

- **If wrong:** someone plans capacity against an invented number. Low harm, but it
  is the same class of error as the `pgvector` claim removed alongside it — a
  confident sentence nobody checked.
- **Clears when:** the real quotas are read off the Supabase dashboard for the
  current plan and written down with that provenance. Cheap; worth doing next time
  the dashboard is open anyway.
