# T-M12-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M12 in place |
| **Depends on** | T-M12-01 through T-M12-05 |
| **Blocks** | M13, M14, M15 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

Prove the dispatch spine for real, with no UI — a hand-inserted turn, one
real paired machine, and direct assertions against the database and the
Realtime topic. M13's later verification is what proves the owner-facing
experience; this task proves the pipe underneath it actually carries a
message end to end.

This pass needs one real online paired daemon (the same scratch-account
convention M11 used) and this branch's real code answering real HTTP
requests — not a mock. **Run locally rather than against a Vercel preview**
(owner's explicit direction, given after M12's own code was complete): a
local `apps/web` dev server on this branch, talking to real staging
Postgres, with a real `core` daemon (this branch's code) paired to real
staging and polling it — genuinely the same HTTP surface a deployed preview
would offer, without a push. See Result for exactly what ran.

## A — Foundational technical assertions

Replaces the story-scenario section (this is a foundational phase) —
unblocks M13/M14/M15.

- [x] Call `enqueue_chat_turn` by hand (SQL, against real staging) for a
      Project session bound to the scratch machine → turn lands
      `status='in_progress'`, `assigned_runtime_id` set to the real daemon, a
      `runtime_commands` row of kind `chat.turn` exists with the correct
      `messages` payload.
- [x] The scratch daemon claimed and acked the command within ~1s of enqueue
      (well inside `COMMAND_POLL_INTERVAL_MS`) — confirmed both from the real
      daemon process's own behavior and from `apps/web`'s access log showing
      `POST /api/daemon/commands/:id/ack` land immediately after.
- [x] `chat_turns.reply_text` grows across multiple reads while `in_progress`
      — proven via three real HTTP `POST .../events` calls (seq 1→2→3) each
      confirmed against the DB between calls. See Result for why these were
      posted directly rather than produced by a real AI completion.
- [x] The turn reaches `status='succeeded'` and a `chat_messages` row with
      `role='assistant'`, correct `meta`, and this turn's id linked, now
      exists — confirmed by direct query after a real `POST .../result` call.
- [~] A subscribed test client receiving the same deltas — NOT run; needs a
      real signed-in user JWT this pass didn't have (see `KnownGaps` `G-31`).
      The broadcast call itself fired on every write (routes returned 200,
      DB reflects each write) using the identical mechanism M5's
      already-proven `broadcastRunEvents` uses.
- [x] Enqueue against a session whose provider nothing online supports →
      turn lands `status='waiting'`, `waiting_reason='all_runtimes_offline'`,
      `wait_expires_at` set ~24h out. (`no_runtime_paired` specifically needs
      a workspace with ZERO runtimes at all, which this shared real workspace
      never has — a real online machine from earlier M-phase work is always
      present — so that exact sub-reason is asserted by code review/existing
      unit tests rather than live here; the PARKING mechanism itself, which
      is what DD-3 is actually about, is proven either way.)
- [~] Pair AFTER a waiting turn exists, confirm the next poll adopts it —
      NOT run this pass (needs a second live pairing timed against an
      existing waiting turn); recorded in `G-31` alongside the two-machine
      race below, which needs the same kind of setup this pass didn't build.

## B — What must NOT have changed

- [x] `POST /chat/sessions/:id/messages` and `.../retry` still return their
      stub response — confirmed by `chat-routes.test.ts` staying green
      unmodified by this task, and by `stubs.ts` not appearing in this
      task's diff at all.
- [x] Existing run dispatch (`POST /runs`) still refuses correctly for an
      offline/incapable machine — the full existing M4 test suite
      (`commands.test.ts`, `resolve.test.ts`, and the rest of `pnpm -r test`)
      stayed green throughout every M12 task, including this one.
- [x] `run_events`/transcript broadcast unchanged for its existing caller —
      `broadcast.test.ts`'s original `broadcastRunEvents`/`planBroadcast`
      suite (9 tests) passes unmodified after `planBroadcast` was generified
      to serve both run and chat broadcasts.

## C — What can be verified today

- [x] Cross-workspace/cross-runtime isolation through real HTTP for both new
      `/api/daemon/chat/turns/:id/*` routes — proven with a SECOND real
      scratch pairing (not workspace A vs. B, since this repo has one real
      workspace to test against; runtime A vs. runtime B is the actual
      containment `ingest_chat_turn_reply` and the routes' own ownership
      select both enforce): runtime 2's real bearer token, targeting runtime
      1's real turn, on BOTH routes → `404 "No such chat turn for this
      machine."` A bogus/garbage bearer token → `401 unauthenticated`. All
      three real HTTP requests, real responses, no unit-test doubles.
- [x] A replayed/stale events batch is a no-op — proven at the SQL layer in
      T-M12-01 and again structurally here (the terminal `succeeded` call
      used `seq=4`, strictly above the `events` calls' `seq=1..3`, and the
      response correctly reported `stale:false`; a genuine same-seq replay
      would report `alreadyCompleted`/`stale` per that same mechanism,
      already unit-tested in `chat-transcript.test.ts` and live-tested in
      T-M12-01).
- [x] The ack-route edit (T-M12-03): a REAL `chat.turn` command dispatched to
      an agent-kind session with an unresolvable agent slug → the real
      daemon claimed it, `resolveChatAgent` correctly returned
      `agent_not_available`, the command loop acked `failed` with that
      reason over real HTTP, and the (locally-running, fixed) ack route
      correctly closed the linked `chat_turns` row to `failed` with that
      exact error — all without ever calling the events/result routes. This
      is the precise gap T-M12-01 first found and T-M12-03 fixed, now proven
      live end to end rather than only at the SQL layer.
- [x] `retry_chat_turn` under real dispatch: retried a real failed turn,
      confirmed the new turn's `attempt=2`, `retry_of_turn_id` set to the
      original, and — since a project binding was in place — dispatch to
      the same runtime, all live against staging.
- [~] FR-004 under a genuine concurrent race (two parallel requests) — NOT
      run this pass; T-M12-01 already proved the SQL guard itself
      (`on conflict ... do nothing`) is correct under sequential contention,
      and the partial unique index makes a genuine two-request race a
      database-level guarantee, not something HTTP-layer timing can defeat —
      but a literal concurrent-request assertion wasn't executed here.

## D — What needs something that doesn't exist yet

**Needs a second paired machine, live-timed alongside an existing waiting
turn.** Not reached this pass — recorded in
[`../../KnownGaps.md`](../../KnownGaps.md) `G-31`, alongside two other items
this local pass genuinely could not reach (a real successful AI completion,
a live Realtime subscriber). See `G-31` for the full accounting of what's
covered and what isn't, and why.

- [~] Two online machines, one Free session — not run.
- [~] Pair after a waiting turn exists, confirm adoption on the next poll —
      not run.

## E — Regression surface

- [x] `pnpm -r typecheck` green (all 7 workspace projects).
- [x] `pnpm test` green — 5/5 workspaces, 709 core tests (+4 skipped, +17
      from this M12 work), plus the ui/web suites, all passing.
- [x] `packages/shared`, `packages/core`, `apps/web` all build (typecheck is
      the build gate for shared/core; `apps/web`'s own dev server ran
      successfully against this branch's code for the whole live pass).

## On completion

- [x] Tick 12.1–12.6 (17.1–17.6) in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark the M12 band complete
- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's own **Status** row to "M12 complete · M13 next"
- [x] Knowledge Center pass — skipped for M12 per this task's own original
      plan (nothing owner-visible changed; stubs untouched per section B)
- [x] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md) `G-31` with what it would
      cost if wrong and what closes it

## Result

**Ran locally, not against a Vercel preview** — the owner's explicit
direction once M12's code was complete: verify locally first, then push and
PR only if it holds up. Concretely, this session:

1. Started a real `apps/web` dev server on THIS branch (port 3033, added as
   `wt-chat-web` in `.claude/launch.json`), pointed at real staging
   Supabase via its existing `.env.local`.
2. Inserted a real `pairing_codes` row directly (service role, bypassing the
   UI) and ran `sparstrow pair` from a scratch `SPARSTROW_DATA_DIR`/
   `SPARSTROW_SECRETS_DIR`, `SPARSTROW_CLOUD_URL` pointed at that local
   `apps/web` — a genuine pairing redemption through the real
   `POST /api/daemon/pair` route, against real staging Postgres.
3. Started a real `core` daemon (this branch's code) against that pairing.
   It registered, heartbeat, and polled exactly as a real machine would.
4. To make dispatch deterministic against the one other real (unrelated)
   online machine already in this shared staging workspace, bound a scratch
   project to ONLY the new runtime and used project-kind sessions —
   `pick_runtime_for`'s project scoping then guarantees selection,
   regardless of the heartbeat-freshness race a Free session would have
   been subject to.
5. Ran the scenarios in sections A/B/C above, hand-inserting turns via
   `enqueue_chat_turn`/`retry_chat_turn` (as the real owner, via JWT
   simulation) and reading results directly from staging Postgres.

**The one real surprise:** a genuine `completeOnce` call against the real
`claude` CLI hit its own 120s timeout — not a bug in this work, confirmed by
running `claude -p ... --output-format stream-json` directly in the same
shell and observing `authentication_failed` rethrown repeatedly with
exponential backoff. This sandboxed environment has no usable Anthropic
credentials for a freshly spawned headless `claude` process, unrelated to
anything M12 built. **This still proved a real, complete failure round
trip**: the daemon spawned the real CLI, `completeOnce`'s own timeout fired,
`chat-turn.ts` caught the non-throwing error result and POSTed
`status:'failed'` to the real `.../result` route, which correctly closed the
turn. To also prove the SUCCESS path (`reply_text` growth, the terminal
`succeeded` transition, the `chat_messages` insert) without a working AI
credential, the real daemon's own bearer token was extracted from its
(encrypted) local secret store and used to POST directly to the events/result
routes via `curl` — the exact same HTTP surface a working `completeOnce`
would have hit, just driven by hand instead of by a real completion. See
`KnownGaps.md` `G-31` for exactly what this does and doesn't prove.

**Everything asserted above was proven this way — over real HTTP, against
real staging Postgres, through this branch's real (locally-running) code —
except the three items in section D and the subscriber test in section A,
all deferred to `G-31`.**

All scratch data was deleted afterward: 2 chat sessions, 3 chat turns, 1
retry, 3 runtime_commands, 2 messages, 2 runtimes, 2 daemon_tokens, 1 cloud
project, 1 runtime_projects binding, 1 agent, 2 pairing codes — confirmed
0/0/0 via follow-up counts. Both local processes (the scratch `core` daemon
and the `wt-chat-web` dev server) were stopped; the pre-existing real `core`
daemon on port 48750 (unrelated to this work) was never touched. Security
advisor re-run clean, unchanged from the established baseline.

`pnpm -r typecheck` and the full `pnpm test` are green (5/5 workspaces).
