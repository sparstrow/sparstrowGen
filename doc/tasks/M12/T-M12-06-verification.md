# T-M12-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M12 in place |
| **Depends on** | T-M12-01 through T-M12-05 |
| **Blocks** | M13, M14, M15 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the dispatch spine for real, with no UI — a hand-inserted turn, one
real paired machine, and direct assertions against the database and the
Realtime topic. M13's later verification is what proves the owner-facing
experience; this task proves the pipe underneath it actually carries a
message end to end.

This pass needs one real online paired daemon (the same scratch-account
convention M11 used) and the feature branch's own Vercel preview — not a
mock. If neither is available when this task is worked, that is named here
and recorded in `KnownGaps.md`, not silently skipped.

## A — Foundational technical assertions

Replaces the story-scenario section (this is a foundational phase) —
unblocks M13/M14/M15.

- [ ] Call `enqueue_chat_turn` by hand (SQL, against the preview's database)
      for a Free session with the scratch machine online and capable → turn
      lands `status='in_progress'`, `assigned_runtime_id` set, a
      `runtime_commands` row of kind `chat.turn` exists.
- [ ] The scratch daemon's logs show it claiming and executing the command
      within one poll interval (`COMMAND_POLL_INTERVAL_MS`).
- [ ] `chat_turns.reply_text` grows across multiple reads while the turn is
      `in_progress` (assert at least two distinct non-empty reads, seconds
      apart, for a prompt that forces a multi-step provider answer).
- [ ] The turn reaches `status='succeeded'` and a `chat_messages` row with
      `role='assistant'` and `turn_id` set to this turn now exists.
- [ ] A test client subscribed to `chat:<workspaceId>:<sessionId>` (T-M12-05)
      receives the same deltas that landed in `chat_turns`, in order.
- [ ] Enqueue against a session with zero paired runtimes → turn lands
      `status='waiting'`, `waiting_reason='no_runtime_paired'`,
      `wait_expires_at` set.
- [ ] Pair the scratch machine *after* that waiting turn was created → the
      next poll picks it up and assigns it, without a second enqueue call
      (proves DD-4's "the poll adopts waiting turns," not just that a fresh
      enqueue can find an online machine).

## B — What must NOT have changed

- [ ] `POST /chat/sessions/:id/messages` and `.../retry` still return their
      stub response (M13 hasn't retired them yet) — this phase does not
      touch `apps/web/src/lib/api/handlers/stubs.ts`.
- [ ] Existing run dispatch (`POST /runs`) still refuses with `409
      no_runtime_available` for an offline machine — `private.pick_runtime_for`'s
      extraction from `start_run` must not have changed that function's
      observable behavior. Run the existing M4 test suite, not just this
      phase's new tests.
- [ ] `run_events`/transcript broadcast for an actual task run still works
      unchanged — the shared `planBroadcast` chunking function must behave
      identically for its existing caller after being reused here.

## C — What can be verified today

- [ ] Cross-workspace isolation through real HTTP for both new
      `/api/daemon/chat/turns/:id/*` routes: authenticate as workspace A's
      daemon, target workspace B's turn id → 403/404, not a silent write.
      **Real HTTP request against the deployed preview, not a unit test
      against a fake Supabase client** — this is exactly the class of defect
      M4 shipped once and caught only live.
- [ ] A replayed events batch (same `seq` posted twice) is a no-op the
      second time — `reply_text` and `reply_seq` unchanged.
- [ ] `ack_runtime_command`'s ack-route edit (T-M12-03): manually fail-ack a
      `chat.turn` command before any events post → the linked `chat_turns`
      row transitions to `failed` with the ack reason as `error`.
- [ ] FR-004 under a real race: fire two `enqueue_chat_turn` calls at the
      same session concurrently (two parallel requests, not sequential) →
      exactly one succeeds, the other raises `SPG16`.

## D — What needs something that doesn't exist yet

**Needs a second paired machine.** "Either of two online machines may answer
a Free session" is not reachable with one scratch machine — this is the same
constraint `G-15` and `G-24` already carry for other M-phases. Record as a
`KnownGaps` entry rather than a tick, following those entries' existing shape.

- [ ] Two online machines, one Free session — assert exactly one of them is
      assigned, never both.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `packages/shared`, `packages/core`, `apps/web` all build

## On completion

- [ ] Tick 12.1–12.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark the M12 band complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's own **Status** row to "M12 complete · M13 next"
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — **skip this for M12**, since
      nothing owner-visible changed yet (the stubs are untouched per section B
      above); M13's verification task is where the KC pass actually applies
- [ ] Every unreached assertion above (section D, and any others) written
      into [`../../KnownGaps.md`](../../KnownGaps.md) with what it would
      cost if wrong and what closes it

## Result

<!-- Filled in when this task lands. Name what was actually run against the
     real preview and the real scratch daemon — not "verified". -->
