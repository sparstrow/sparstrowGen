# T-M4-08 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs everything else landed |
| **Depends on** | T-M4-01 … T-M4-07 |
| **Blocks** | M5, M6 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

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

- [ ] Press **Run** in the browser. A process starts on this machine within ~3s
- [ ] The run row reaches `succeeded`, with `cost_usd`, `num_turns` and
      `duration_ms` populated
- [ ] `runtime_commands` shows exactly one row, `status = 'done'`, `attempts = 1`
- [ ] The local run's id **equals** the cloud run's id (decision 4 — M5 depends on it)

### B. `G-3` — the WIP snapshot fires

- [ ] `git for-each-ref refs/sparstrow/wip/` in that project names the run id
- [ ] `git status` reads identically before and after; HEAD did not move; the
      staged/unstaged split survived
- [ ] `.gitignore`d files are absent from the snapshot tree
- [ ] **Delete `G-3` from `KnownGaps.md`**, naming this task as the proof

### C. Exactly once

- [ ] Kill core between claim and ack (`SIGKILL` during dispatch). On restart the
      command is re-claimed after its lease expires and the run executes **once**
- [ ] Enqueue the same run twice; the second returns the existing run and no
      second command row appears
- [ ] Two rapid polls do not both claim the same row (T-M4-01 proved this in SQL;
      confirm it holds through HTTP)
- [ ] A command that fails five times reaches `expired` and stops being dispatched

### D. Cancel

- [ ] Cancel a long run from the browser; the local process dies and the run
      reaches `cancelled`
- [ ] Cancel a run that has already finished; the UI reports no error

### E. `project_not_available`

- [ ] Unbind the project and queue again: the task lands in
      `project_not_available`, **nothing spawns**, and all four actions are offered
- [ ] Rename the project directory on disk without unbinding, then queue: the
      claim-side preflight catches it, `runtime_projects.state` becomes `missing`,
      and again nothing spawns
- [ ] Reassign to another bound runtime and confirm it runs there
- [ ] Relink to the corrected path and confirm the next run succeeds
- [ ] Clone from `gitRemote` into a fresh directory produces a bound project

### F. `agent_not_available`

- [ ] Queue against a cloud agent with no local slug match: the task blocks with a
      legible message naming the machine and the slug. Nothing spawns

### G. Isolation

- [ ] Workspace B's daemon token cannot claim A's commands
- [ ] Workspace B's token cannot ack A's command id, nor post status for A's run id
- [ ] Both return 401/403/404 — never a 200 with no effect (M2's lesson: a write
      that reports success while doing nothing passes every test that only reads
      the status code)

### H. `G-4` — the snapshot race

- [ ] Two runs queued for the same project back to back: the second does not start
      while the first is snapshotting
- [ ] A snapshot that throws still releases the busy key and still hands off
- [ ] **Delete `G-4` from `KnownGaps.md`**

### I. `G-6` — the per-runtime toggle

- [ ] Flip the snapshot switch in the Machines card; the daemon acks and the local
      SQLite setting changes
- [ ] With the daemon stopped, the switch is disabled and says why
- [ ] **Delete `G-6` from `KnownGaps.md`**

### J. Regression

- [ ] `pnpm -r typecheck`
- [ ] `pnpm -r test` — the existing suite stays green; M4 adds a layer, it does
      not alter the runner
- [ ] The local, core-served UI still starts runs with no cloud involved. An
      unpaired machine is a supported state and must be re-proved, not assumed

### K. Browser pass

- [ ] Per AGENTS.md §3.10: drive the real UI, report console errors and usability
      problems, fix, re-verify, repeat until clean

## On completion

- [ ] Tick 6.8 and flip Band 6 to done in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] `Status: ✅ done <date>` on [README.md](README.md)
- [ ] Status table in [`../README.md`](../README.md)
- [ ] Plan header `Status` → `M4 complete · M5 next`
- [ ] `G-3`, `G-4`, `G-6` deleted from `KnownGaps.md`; anything newly unproved added
- [ ] Knowledge Center re-read against what shipped (§3.2) — the four global-claim
      articles, not only the ones this phase touched

## Result

*(written when the task runs — what was actually executed, what was not, and
where the evidence lives)*
