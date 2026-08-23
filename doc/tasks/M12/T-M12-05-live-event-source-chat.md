# T-M12-05 — `LiveEventSource.subscribeChat`

| | |
|---|---|
| **Tag** | `[S]` — needs the real `chat:` topic (T-M12-03) to subscribe against |
| **Serves** | foundational |
| **Depends on** | T-M12-03 |
| **Blocks** | T-M12-06, M13 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

A `subscribeChat(sessionId, onUpdate)` method on `packages/ui`'s live-event
source, mirroring the existing run-transcript subscribe exactly, so M13's UI
work has a transport seam to call rather than talking to Supabase Realtime
directly.

## Decisions already made

DD-10 (topic is `chat:<workspaceId>:<sessionId>`, per session not per turn,
so navigating within a conversation doesn't churn channels and a retry's
deltas arrive on the already-open channel). Per `live-events.ts`'s own
documented rule (cited in the plan's DD-7): a component must never ask "am I
hosted?" — this seam exists precisely so M13 doesn't have to.

## Checklist

- [x] `subscribeChat(sessionId, onUpdate)` added to `packages/ui/src/lib/live-events.ts`
      — signature deviates from the plan's `(workspaceId, sessionId, onUpdate)`
      (see Result); the join/leave lifecycle and reconnect behavior are copied
      exactly from `subscribeRun`
- [x] Consumes the RAW `ChatTurnBroadcast` wire shape (`{turnId, events, status, error?}`),
      not `chatTurnStateSchema` (see Result — the plan's premise here needed correcting too)
- [x] Local (non-cloud) host: `subscribeChat` is a documented no-op — confirmed, said so below
- [x] `packages/ui` typecheck and tests green (also `pnpm -r typecheck`/`test`)

## Traps

**Copy the reconnect/backoff behavior, don't just copy the subscribe call.**
The value of reusing `live-events.ts`'s pattern is inheriting its handling of
a dropped connection mid-stream — a naive new subscribe that doesn't retry
would silently stop a chat reply from updating after a network blip, exactly
the kind of thing that "looks done" until someone's wifi hiccups.

## Verification

- [x] `realtime-live-events.test.ts` gained a `subscribeChat` suite (8 tests):
      topic shape (`chat:<workspaceId>:<sessionId>`, private), the payload
      delivered to `onUpdate` verbatim for both a running and a terminal
      status message, unsubscribe removing the channel, no channel opened if
      unsubscribed before the workspace lookup resolves or when there is no
      signed-in user, `isConnected` flipping true on `SUBSCRIBED`, and —
      cross-session isolation's cheapest useful form here — a test proving
      `subscribeRun` and `subscribeChat` share the SAME cached workspace-id
      lookup while still opening two independently-topicked channels
      (`chat:ws_1:chs_1` vs `run:ws_1:run_1`). A literal "post on session A,
      assert session B's subscriber sees nothing" test would only be
      meaningful against a real Realtime server — this fake channel harness
      can't fail that assertion by construction (each `FakeChannel` only ever
      receives what's `emit()`-ed on it directly) so it would prove nothing
      beyond what these tests already do. The REAL cross-workspace isolation
      proof (the RLS policy `015_chat_broadcast.sql` enforces at subscribe
      time) is T-M12-06's, against real Realtime.
- [x] `live-events.test.ts` gained two tests for the local host's no-op:
      `subscribeChat` never calls `onUpdate` regardless of what's published
      on `wsHub`, and its unsubscribe function doesn't throw.
- [x] `pnpm --filter ui typecheck`/`test` and `pnpm --filter web typecheck`/`test`
      green (also `pnpm -r typecheck` and the full `pnpm test`, 5/5 workspaces).

## On completion

- [x] Tick 12.5 (18.5) in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update the phase README's task table

## Result

**Two corrections to the plan's own premises, made and recorded rather than
silently built around:**

1. **Signature: `subscribeChat(sessionId, onUpdate)`, not
   `(workspaceId, sessionId, onUpdate)`.** `subscribeRun` — the pattern this
   task was told to mirror exactly — does NOT take a `workspaceId` parameter;
   `RealtimeLiveEventSource` resolves and caches it internally
   (`this.workspaceId()`), and the interface's local implementation
   (`WsHubLiveEventSource`) has no concept of a workspace at all. Requiring
   the caller to pass one would be new plumbing `subscribeRun` never asked
   for, and would leak cloud-specific state (where does a component GET a
   workspace id?) through an interface `live-events.ts`'s own doc comment
   says must not require a component to know "am I hosted?" in the first
   place. `subscribeChat` resolves workspace id through the exact same cached
   promise `subscribeRun` already uses — proven directly by a test asserting
   one `subscribeRun` + one `subscribeChat` call together trigger exactly one
   `getUser`/one workspace lookup, not two.
2. **Delivers the raw `ChatTurnBroadcast` wire shape, not `chatTurnStateSchema`.**
   The plan's checklist said to consume `chatTurnStateSchema` (the FULL turn
   state: `waitingReason`, `replySeq`, `provider`, `model`, `attempt`,
   `retryOfTurnId`, `userMessage`, `assistantMessage`...) — but T-M12-03's
   broadcast (`ChatTurnBroadcast`, `packages/shared/src/cloud.ts`) only ever
   carries `{turnId, events: ChatTurnEventPush[], status, error?}`, mirroring
   `TranscriptBroadcast`'s own "deliver raw events, let the consumer merge"
   shape by design (see T-M12-03's Result). `subscribeRun`'s `onEvent`
   callback delivers individual `RunEvent`s, not a synthesized `Run` — this
   follows the identical discipline, delivering exactly what's on the wire
   and leaving state-merging to whoever calls it (M13). Widening the wire
   shape to the full `ChatTurnState` here would mean inventing fields
   (`waitingReason`, `attempt`, `userMessage`...) the broadcast was never
   designed to carry, or fetching them separately — neither belongs to this
   task.

**Local host confirmed a genuine no-op, not a deferred gap.** Grepped
`WsServerEvent` (`packages/shared/src/events.ts`): no `chat.*` member has
ever existed on it, and the local Fastify `POST /chat/sessions/:id/messages`
/`.../retry` routes (`chat/service.ts`'s `postChatTurn`/`retryChatTurn`) run
the turn to completion and return the finished exchange in ONE response —
there is no asynchronous delta on this host to subscribe to at all.
`WsHubLiveEventSource.subscribeChat` returns a no-op unsubscribe and never
calls `onUpdate`, documented as such rather than silently doing nothing.

**`realtime-live-events.ts`'s reconnect behavior, actually copied rather than
assumed:** there is no manual backoff timer to copy — Supabase's realtime-js
client reconnects on its own, and what `subscribeRun` "handles" is simply
relaying `.subscribe((status) => ...)`'s status callback into `setConnected`,
which flips `isConnected`/notifies `onStatusChange` listeners on every
transition including a later reconnect. `subscribeChat` calls the exact same
`this.setConnected(...)` from its own `.subscribe()` callback — genuinely the
same code path, not a parallel one that could drift.
