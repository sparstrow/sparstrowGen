# T-M12-03 — daemon-facing routes + broadcast policy

| | |
|---|---|
| **Tag** | `[P]` — touches `apps/web/*` and a new SQL policy file only; zero overlap with T-M12-04's `packages/core/*` |
| **Serves** | foundational |
| **Depends on** | T-M12-02 |
| **Blocks** | T-M12-05, T-M12-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `POST /api/daemon/chat/turns/[id]/events` route added
- [ ] `POST /api/daemon/chat/turns/[id]/result` route added
- [ ] Both routes reuse `planBroadcast` from `apps/web/src/lib/daemon/broadcast.ts` — not forked
- [ ] Both routes resolve `runtimeId` from the bearer token, never from the request body
- [ ] Ack-route edit: `chat.turn`-kind command, `failed` ack → calls `ingest_chat_turn_reply` with the failure
- [ ] `015_chat_broadcast.sql` written and applied (scratch branch first, per the `supabase` skill)
- [ ] `apps/web` typecheck and tests green

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

- [ ] Cross-workspace isolation, through real HTTP: post events for turn
      belonging to workspace A using workspace B's daemon bearer token →
      404/403, not a silent write. **This must be a real HTTP request, not a
      unit test against a fake Supabase client** — M4's own defect here was
      caught only live.
- [ ] A malformed batch (one valid entry, one missing `seq`) is rejected
      whole — assert nothing from the batch landed in `chat_turns`.
- [ ] A duplicate events POST (same `seq` twice) is a no-op on the second call.
- [ ] Manually ack a hand-created `chat.turn` command as `failed` → the
      linked `chat_turns` row transitions to `failed` with the ack's reason
      as `error`, without ever calling the events/result routes.
- [ ] `pnpm --filter web typecheck` and `pnpm --filter web test` green.

## On completion

- [ ] Tick 12.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

<!-- Filled in when the task lands. -->
