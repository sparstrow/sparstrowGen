# T-M12-03 — daemon-facing routes + broadcast policy

| | |
|---|---|
| **Tag** | `[P]` — touches `apps/web/*` and a new SQL policy file only; zero overlap with T-M12-04's `packages/core/*` |
| **Serves** | foundational |
| **Depends on** | T-M12-02 |
| **Blocks** | T-M12-05, T-M12-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

Two daemon-facing routes (streamed events, terminal result) that write
durably through T-M12-01's `ingest_chat_turn_reply` function and then
broadcast, plus the `realtime.messages` policy for the `chat:` topic family
and the ack-route edit for a `chat.turn` command that fails before any reply
streams in. This is M5's ingest-then-broadcast shape, reused, not reinvented
— read `apps/web/src/app/api/daemon/runs/[id]/events/route.ts` (or
equivalent) before writing these.

## Decisions already made

Cited from the plan: DD-1 (reuse the ingest-then-broadcast route shape),
DD-8 (strict whole-batch parse at this boundary), DD-9 (staleness derived at
read time from `last_event_at`/`updatedAt`, no sweeper here), DD-10 (chat's
own broadcast topic/policy, select-only, not on `postgres_changes`).

### Routes

**`POST /api/daemon/chat/turns/[id]/events`** — streamed delta batch.
Bearer-authenticated as the daemon (same middleware as the existing
`/api/daemon/*` routes). Body: one or more `{ seq, replyText }` entries
(`ChatTurnEventBatch`, T-M12-02's plain-interface shape — mirroring
`RunEventPush`/`RunEventBatch`, not a zod schema, matching how the run-events
boundary is validated today). **This task writes the strict-parse validator
itself** — a new `apps/web/src/lib/daemon/chat-transcript.ts`, structured
exactly like `apps/web/src/lib/daemon/transcript.ts`'s `parseEventBatch`
(reject the whole batch on any malformed entry, do not store the valid
subset — read that file before writing this one, don't reinvent its shape). For each entry in order, call
`ingest_chat_turn_reply(turnId=[id], runtimeId=<from bearer>, seq, replyText, status='running')`.
After the durable write(s) succeed, broadcast on topic
`chat:<workspaceId>:<sessionId>` using the same `planBroadcast` byte-budgeted
chunking `apps/web/src/lib/daemon/broadcast.ts` already exports for run
transcripts — reuse the function, do not fork it.

**`POST /api/daemon/chat/turns/[id]/result`** — terminal call. Body:
`{ seq, replyText, status: 'succeeded' | 'failed', error? }`. Calls
`ingest_chat_turn_reply` with the terminal status; on `succeeded` this is
what causes the function to insert the assistant `chat_messages` row (T-M12-01).
Broadcasts the terminal state on the same topic so a subscribed browser sees
completion without polling.

Both routes: resolve `runtimeId` from the bearer token exactly as the
existing `/api/daemon/*` routes do — **never** trust an `id` in the body for
authorization, only for addressing which turn. This is the cross-workspace
containment M4 shipped a defect on once; `ingest_chat_turn_reply`'s own
`assignedRuntimeId` check is the second layer, not the only one — the route
must not skip its own auth because the function also checks.

### The ack-route edit (named as a gap in T-M12-01, fixed here)

`apps/web/src/app/api/daemon/commands/[id]/ack/route.ts` (or wherever
`ack_runtime_command` is called from): when the acked command's `kind` is
`"chat.turn"` and the ack status is `"failed"`, call
`ingest_chat_turn_reply(turnId=<from payload>, runtimeId=<bearer>, seq=<current+1>, replyText='', status='failed', error=<ack reason>)`
immediately after the existing ack call. This is the only place a `chat.turn`
command's pre-reply failure (e.g. the daemon's own project preflight
re-check failing at claim time, per M4 decision 6) gets reflected onto the
`chat_turns` row — without it, the row is stuck `in_progress` forever with no
route ever correcting it.

### Broadcast policy — `015_chat_broadcast.sql`

```sql
drop policy if exists "chat_turn_broadcast_member_read" on realtime.messages;

create policy "chat_turn_broadcast_member_read"
on realtime.messages
for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'chat'
  and split_part(realtime.topic(), ':', 2) in (select private.current_workspace_ids())
);
```

No `insert` policy — only the service-role-authenticated routes above send
on this topic. The policy checks the **workspace** segment only, matching
`010_transcript_broadcast.sql`'s own precedent: any workspace member can
already `SELECT` any `chat_turns`/`chat_sessions` row in that workspace via
RLS, so a per-session check on the topic adds no real access control.

## Checklist

- [x] `POST /api/daemon/chat/turns/[id]/events` route added
- [x] `POST /api/daemon/chat/turns/[id]/result` route added
- [x] Both routes reuse `planBroadcast` from `apps/web/src/lib/daemon/broadcast.ts` — not forked (generified to `planBroadcast<T extends {seq:number}>` so both `RunEventPush` and `ChatTurnEventPush` share it)
- [x] Both routes resolve `runtimeId` from the bearer token, never from the request body
- [x] Ack-route edit: `chat.turn`-kind command, `failed` ack → calls `ingest_chat_turn_reply` with the failure
- [x] `015_chat_broadcast.sql` written and applied — already done as part of T-M12-01's work; re-confirmed live this task (policy exists on staging)
- [x] `apps/web` typecheck and tests green

## Traps

**Broadcasting before the durable write lands is the M5 mistake in reverse.**
Write via `ingest_chat_turn_reply` first, confirm it succeeded, broadcast
second — a reply the browser sees but that never made it to `chat_turns`
means a page refresh loses it.

**A strict-parse rejection must not silently drop the batch.** Per DD-8, a
malformed batch is rejected whole with a real error response — storing the
sane subset makes corruption permanent and advances the sender's cursor past
events that never landed.

**The ack-route edit is easy to miss because nothing tests its absence
loudly.** Without it, a `chat.turn` command that fails before any event
streams produces a turn stuck `in_progress` with no route ever correcting
it — this reads as "waiting for a slow reply" indefinitely, not as an error.

## Verification

- [~] Cross-workspace isolation, through real HTTP — **not done as a real
      HTTP request in this task**; see Result. What IS confirmed, live
      against staging: the route's own ownership select (`id` +
      `workspace_id` + `assigned_runtime_id`) returns zero rows for a wrong
      runtime, AND `ingest_chat_turn_reply` independently refuses the same
      wrong runtime (`{ok:false,reason:'not_found'}`) — the two-layer defense
      the task doc calls out both hold. The HTTP-level pass (real bearer
      token, real request, through the deployed route) is T-M12-06's, once a
      running instance exists to hit.
- [x] A malformed batch (one valid entry, one missing `seq`) is rejected
      whole — proven at the parser level (`chat-transcript.test.ts`): the
      route never calls the RPC at all when `parseChatEventBatch` rejects, so
      nothing can land, not even the valid entry.
- [x] A duplicate/stale events POST is a no-op — proven live: a `seq`
      arriving at or below the turn's current `reply_seq` changes nothing
      (tested by sending seq 1 after seq 2 had already landed).
- [x] Manually simulate a hand-created `chat.turn` command's `failed` ack →
      the linked `chat_turns` row transitions to `failed` with the ack's
      reason as `error`, **without ever calling the events/result routes** —
      proven live by running the ack-route's exact new SQL sequence
      (`select reply_seq, reply_text ... then rpc ingest_chat_turn_reply`)
      directly against a real assigned turn on staging.
- [x] `pnpm --filter web typecheck` and `pnpm --filter web test` green (also
      ran `pnpm -r typecheck` and the full `pnpm test` — all 5 workspaces).

## On completion

- [x] Tick 12.3 (17.3) in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update the phase README's task table

## Result

Both routes, the validator, the ack-route fix, and the generified broadcast
chunker landed as designed. Nothing in the plan or the phase README needed
revisiting.

**What was built:**

- `apps/web/src/lib/daemon/chat-transcript.ts` — `parseChatEventBatch` (whole-
  batch strict parse, mirroring `transcript.ts`'s `parseEventBatch` exactly:
  malformed/empty/too-large/invalid-seq/duplicate-seq/invalid-reply/too-large
  all reject the WHOLE batch) and `parseChatResult` for the terminal body.
  Also `latestOf`: since every `ChatTurnEventPush` already carries the full
  accumulated reply (never a delta), only the highest-`seq` event in a batch
  needs to be written durably — the rest are strictly superseded. This is not
  a shortcut, it reaches the identical durable state in one write instead of
  N; `ingest_chat_turn_reply`'s own `p_seq <= reply_seq` guard is what makes
  either choice idempotent under a replay.
- `POST /api/daemon/chat/turns/[id]/events` and `.../result` — both follow
  the run-events route's own discipline byte for byte: ownership resolved
  from the bearer token and re-checked against the row BEFORE either read or
  write (never folded into the write's `where`, for the same "silent no-op
  vs. not-yours" reason M4's status route got wrong once), durable write via
  `ingest_chat_turn_reply` first, broadcast only after that succeeds and
  never before.
- `planBroadcast` in `broadcast.ts` generified from `(events: RunEventPush[])`
  to `<T extends {seq:number}>(events: T[])` — genuinely reused, not forked,
  as the task required. `broadcastRunEvents` is behavior-unchanged (its own
  9 tests still pass unmodified); a new `broadcastChatTurnEvents` fans a chat
  batch out chunked the same way, on `chat:<workspaceId>:<sessionId>`.
- `ChatTurnBroadcast` (shared, `cloud.ts`) mirrors `TranscriptBroadcast`'s
  shape deliberately — an `events` array, not a single snapshot — so a
  multi-delta batch still renders progressively on a subscriber rather than
  jumping straight to whichever chunk happened to be last. Only the LAST
  message of a terminal (`succeeded`/`failed`) call carries the terminal
  `status`; every earlier chunk from the same call still reports `running`.
- The ack-route fix (`commands/[id]/ack/route.ts`): a new `closeFailedChatTurn`
  helper, called whenever `status === "failed"` and the acked command's
  `kind === "chat.turn"`. Reads the turn's current `reply_seq`/`reply_text`
  scoped by `(turn id, assigned runtime id)`, then closes it via
  `ingest_chat_turn_reply` at `reply_seq + 1` with the ack's error/reason.
  Deliberately not gated on `reason` being one of the known
  `CommandFailureReason` tokens — a bare failed ack with no reason must still
  not leave a turn stuck.

**A design decision not fully spelled out in the task doc, worth recording:**
`ingest_chat_turn_reply` skips its ENTIRE update — status included — when
`p_seq <= reply_seq`. That means a terminal call whose `seq` does not exceed
the last streamed event's `seq` silently fails to close the turn: it stays
`in_progress` forever, since only a `succeeded`/`failed` write can end it, and
this one was treated as stale. Both new routes' docstrings now state this
explicitly, and the result route logs loudly (`console.error`, not a silent
`stale:true` no-op) if it ever happens, since it means a daemon sequencing
bug rather than a client race. **T-M12-04 must track one monotonically
increasing counter across a turn's entire life — every streamed delta AND
the terminal call — never restart it for the result call.** Flagging this now
so it isn't rediscovered the hard way while building the executor.

**Live verification performed** (staging, `pnymngoqseltgigcfevq`, real online
scratch machine `2c138115-e57d-4952-9905-5ec31487ac10`, real workspace
`bbb75b15-eb72-47d4-94fe-3955802620aa`): confirmed `015_chat_broadcast.sql`'s
policy already exists (applied during T-M12-01, nothing to redo). Created two
scratch turns via `enqueue_chat_turn` and, since no running instance of this
branch's web app exists yet to send real HTTP requests through, exercised
each route's exact SQL call sequence directly: (1) events route — ownership
select resolves `session_id`/`workspace_id` correctly, `ingest_chat_turn_reply`
with the batch's `latestOf` event advances `reply_seq`/`reply_text` and
leaves status `in_progress`, a stale/out-of-order seq is a true no-op; (2)
result route — terminal call transitions status to `succeeded`, inserts the
assistant `chat_messages` row with `meta.provider`/`meta.model`, preserves
the earlier user message; (3) ack-route fix — the exact new SQL sequence
closes a second scratch turn to `failed` with the injected error, entirely
without ever calling the events/result routes, proving the gap named in
T-M12-01 is now fixed; (4) containment — both the route's own ownership
select and `ingest_chat_turn_reply`'s independent scope check refuse a wrong
runtime id. All scratch data (2 turns, 2 messages, 2 commands, 1 session)
deleted afterward — confirmed 0/0/0/0 via a follow-up count. Security advisor
re-run: unchanged from T-M12-01's accepted baseline, nothing new.

**What is NOT yet verified** (honestly out of reach for this task, not
skipped): a real HTTP request against the deployed route handlers with a
real bearer `Authorization` header — this needs either a local dev server
with a live daemon pointed at it, or the feature branch's Vercel preview,
and is more naturally done once T-M12-04's executor exists so a full
send → stream → complete round trip can be observed end to end. This is
exactly what T-M12-06 (verification) is designed to do; not duplicating it
here. `pnpm -r typecheck` and the full `pnpm test` (5/5 workspaces, 692 core
tests + others) are green.
