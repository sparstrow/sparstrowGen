# T-M4-08 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs everything else landed |
| **Depends on** | T-M4-01 … T-M4-07 |
| **Blocks** | M5, M6 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified live on staging 2026-08-11 (four items deferred, see Result) |

## Objective

Prove the spine on real staging with this Windows machine paired — not in unit
tests, which cannot fail the way distributed dispatch fails.

**Read [`../../KnownGaps.md`](../../KnownGaps.md) before starting.** Three entries
are M4's to close, and one of them (`G-3`) is the reason this task exists in the
shape it does.

## Decisions already made

**An agent's browser session is minted with the admin API and `/auth/confirm`** —
the procedure OQ-2 settled, in
[`../../runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).
No password is typed and no bypass is used.

**Weaker evidence is written down, not quietly accepted.** Anything ticked on
less than it asked for gets a `KnownGaps.md` entry in this same change, per
AGENTS.md §5. A ticked box that means "looked right to me" devalues every other
ticked box in the repo.

## Setup

1. A cloud agent whose **slug matches a local agent on this machine** — phase
   decision 5 means dispatch resolves by slug and definitions do not sync, so
   this is a real setup step, not an oversight. Note how long it takes; if it is
   annoying, that is evidence for unparking [D-9](../../Deferred.md).
2. A cloud project whose slug matches a local project with a dirty working tree.
   The dirt is required — `G-3` cannot be proved against a clean tree.
3. Core running, paired, online in the UI.

## Assertions

### A. The happy path

- [x] A process starts on this machine within ~3s of the run being queued
- [x] The run row reaches `succeeded`, with `cost_usd`, `num_turns` and
      `duration_ms` populated — `run_55c74f38d81c4668`, result text "OK"
- [x] `runtime_commands` shows exactly one row, `status = 'done'`, `attempts = 1`
- [x] The local run's id **equals** the cloud run's id — the snapshot ref is named `refs/sparstrow/wip/run_154b6cc1cbef424a`, a cloud-minted id, on local disk

### B. `G-3` — the WIP snapshot fires

- [x] `git for-each-ref refs/sparstrow/wip/` names the run id
- [x] `git status` reads identically before and after; HEAD did not move; the
      staged/unstaged split survived (`A staged.txt`, ` M tracked.txt`, `?? untracked.txt`)
- [x] `.gitignore`d files are absent — `.env` and `node_modules/` are not in the tree
- [x] **`G-3` deleted from `KnownGaps.md`**, naming this task as the proof

### C. Exactly once

- [~] Kill core between claim and ack → **not run live**; proved deterministically in SQL
      (`verify-command-spine.mjs`: an expired lease is re-claimed and `attempts` increments).
      See Result
- [x] A duplicate idempotency key is rejected by the unique index (23505); exactly one row survives
- [~] Two rapid polls through HTTP → **not run live**; proved in SQL with two concurrent
      sessions and an uncommitted claim. See Result
- [~] The five-attempt ceiling → proved in SQL, not live. See Result

### D. Cancel

- [x] Cancel reaches a run in flight: `run_5619e1e5f59e4c85` ended `cancelled` after 292ms,
      both commands `done`
- [x] Cancelling a finished run is a no-op: status unchanged, **zero** cancel commands enqueued

### E. `project_not_available`

- [x] A project no runtime is bound to is refused **at enqueue** with `SPG13`; zero runs created
- [x] Renamed the directory without unbinding: claim-side preflight caught it, the command
      failed with "The directory for \"WIP Lab\" is no longer there.", `state` became `missing`
      with the path in `detail`, nothing spawned — and the cloud then refused the next enqueue
- [~] Reassign → **not run live**: only one machine was paired, so there was no second bound
      runtime to reassign to. See Result
- [x] Relink through `PUT /api/v1/runtimes/:id/projects/:projectId` with a real browser
      session returned the binding as `bound` and unblocked enqueue
- [~] Clone end-to-end → **not run live**. Every guard is unit-tested, including the
      non-empty-directory refusal and the no-shell argument passing. See Result

### F. `agent_not_available`

- [x] A cloud agent with no local slug match failed with: *This machine has no agent with
      the slug "no-such-agent-here". Create it here, or run this on a machine that has it.*
      Nothing spawned

### G. Isolation

- [x] Workspace B's daemon token claims nothing — `{"commands":[]}`
- [x] B cannot ack A's command (404) nor post status for A's run (404); A's run row was
      re-read afterwards and was untouched
- [x] **This one failed first time and was fixed.** The status route returned
      `200 {ok:true, applied:false}` for another workspace's run — the exact shape this
      assertion exists to catch. Now 404, identical to an unknown id

### H. `G-4` — the snapshot race

- [~] Two concurrent same-project runs → **not run live**; the invariant is unit-tested in
      `run-manager-finalize.test.ts`. See Result
- [x] A snapshot that throws still releases the busy key and still hands off (unit-tested,
      5 cases)
- [x] **`G-4` deleted from `KnownGaps.md`**

### I. `G-6` — the per-runtime toggle

- [x] Flipped through `PUT /api/v1/runtimes/:id/settings` with a real session: the daemon
      applied it (`{"git.wipSnapshot":"off"}` in its own settings API), acked `done`, and
      reported the value back into `reported_settings`. **And it has real effect** — a run
      with the switch off produced no new ref and logged no snapshot
- [~] The offline-disabled switch was **not seen rendered** (see K); the route refuses with
      409 `runtime_offline`, which is the behaviour behind it
- [x] **`G-6` deleted from `KnownGaps.md`**

### J. Regression

- [x] All four packages typecheck clean
- [x] 748 tests green (core 594 + 4 skipped, shared 75, web 60, ui 19)
- [~] The unpaired local UI was **not re-proved**. Core did serve its own API throughout
      (settings and agent edits went through it), but no run was started from the local UI
      with the cloud absent. See Result

### K. Browser pass

- [~] **Partly.** Signed in through the real magic-link path and exercised every M4 endpoint
      from the page's own `fetch` with the session cookie — which found two real defects. The
      click-through pass did not happen: the Browser pane never composited, so screenshots
      and the accessibility tree were both unavailable. See Result

## On completion

- [x] Tick 6.8 and flip Band 6 to done in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] `Status: ✅ done 2026-08-11` on [README.md](README.md)
- [x] Status table in [`../README.md`](../README.md)
- [x] Plan header `Status` → `M4 complete · M5 next`
- [x] `G-3`, `G-4`, `G-6` deleted; `G-12` added for what this pass could not reach
- [x] Knowledge Center re-read against what shipped (§3.2)

## Result — verified live on staging 2026-08-11

The spine works. A run queued in the cloud started on this Windows machine
within one poll interval, executed a real model, and came back `succeeded` with
its metrics — and the WIP snapshot fired, which is what `G-3` had been waiting
for since it was raised.

### Setup, and what it cost

The setup step phase decision 5 predicted was real and did take effort: staging
had **zero** runtimes, agents and projects (M3's fixtures were cleaned up), so
this pass created a cloud agent, a cloud project, a matching local agent and a
matching local project by slug, and paired a fresh daemon.

Core ran with `SPARSTROW_DATA_DIR` and `SPARSTROW_SECRETS_DIR` pointed at a
scratch directory, deliberately: the owner's real `data/sparstrow.db` and
`~/.sparstrow` were never written to.

**This is evidence for unparking [D-9](../../Deferred.md).** Making one agent
runnable from the browser meant hand-creating the same agent twice, once on each
side, matched by slug. It works, and it is exactly as tedious as the decision
said it would be.

### Three defects, found only because this ran for real

**1. A failed run's error read "success".** The Claude Code provider used the
result event's `subtype` as the error message, and the CLI sets `is_error: true`
alongside `subtype: "success"` when the turn completed but its content is an
error. The real message — *"Failed to authenticate. API Error: 401 … OAuth
access token has expired"* — was sitting in `result` the whole time. Fixed in
`claude-code.ts` with `errorMessageFrom`, 5 tests.

**2. The status route reported success while doing nothing.** Workspace B
posting `failed` on workspace A's run got `200 {ok:true, applied:false}`. The
data was safe — the write was correctly scoped — but the *response* was the
precise shape of M2's worst defect, and a daemon reporting on a run it does not
own would have been told everything was fine. Ownership is now established
before the guarded update: a foreign or unknown id gets a 404 (identical bodies,
so it is still not an id oracle), while a genuinely superseded update from the
rightful owner still gets `200 applied:false`. Both paths re-verified live.

**3. Two of the new `/api/v1` routes could never have worked.** The catch-all
runs every request body through `parseBody` → `toSnake` before a handler sees
it, so relink and clone were reading `body.localPath` when the value had already
become `body.local_path`. Every well-formed relink returned 400. The settings
toggle worked only by luck, because `key` and `value` are single words. This is
the defect class that unit tests cannot reach and a real request finds in one
call.

A fourth, in the same family: **`reported_settings` was missing from the
`GET /runtimes` column list**, so the per-runtime snapshot switch would have
rendered its default forever — a control that lies quietly, which is precisely
what `G-6` was about.

### One hole closed that nobody had listed

Preflight marks a binding `missing`, and the cloud correctly stops choosing that
machine. But putting the directory back changed nothing: bindings were reported
at boot only, so it stayed `missing` until core restarted. `startBindingReporter()`
now re-reports every ten minutes, unref'd, so a restored directory heals itself.
Three tests.

### What was NOT proved, and why

Recorded as **`G-12`** in [`../../KnownGaps.md`](../../KnownGaps.md) rather than
left in this file, so the register stays the one place to look:

- **The browser click-through pass.** The Browser pane never composited frames
  in this environment, so screenshots and the accessibility tree were both
  unavailable and no element could be clicked. What *was* done through the real
  signed-in session is not nothing — every M4 endpoint was exercised from the
  page's own `fetch` with the session cookie, and that is what found defects 3
  and 4 — but rendering and interaction are unverified.
- **Lease recovery after a mid-claim kill**, the two-poll race, and the
  five-attempt ceiling. All three are proved deterministically in SQL by
  `verify-command-spine.mjs` against a throwaway Postgres; none was reproduced
  live, because each needs a timing window this pass could not reliably hit.
- **Reassign and clone end-to-end.** Reassign needs a second paired machine;
  clone needs a real remote and a fresh directory. The routes and every clone
  guard are tested.
- **The unpaired local UI starting a run.** Core served its own API throughout,
  but no run was started from the local UI with the cloud absent.

### Cleanup

Every staging fixture this pass created was deleted afterwards — runtimes,
tokens, commands, runs, bindings, agents, projects, the pairing code, and the
disposable `@sparstrow.test` account and its membership.
