# T-M12-05 — `LiveEventSource.subscribeChat`

| | |
|---|---|
| **Tag** | `[S]` — needs the real `chat:` topic (T-M12-03) to subscribe against |
| **Serves** | foundational |
| **Depends on** | T-M12-03 |
| **Blocks** | T-M12-06, M13 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `subscribeChat(workspaceId, sessionId, onUpdate)` added to
      `packages/ui/src/lib/live-events.ts`, same shape as the existing
      run-transcript subscribe (same channel-join/leave lifecycle, same
      reconnect behavior)
- [ ] Consumes T-M12-02's `chatTurnStateSchema` shape for the payload it hands to `onUpdate`
- [ ] Local (non-cloud) host: `subscribeChat` is a documented no-op or is
      simply never called by M13 for that host, matching how the local
      Fastify route already returns a terminal-state response with nothing
      to subscribe to — confirm which, and say so in this task's Result
- [ ] `packages/ui` typecheck and tests green

## Traps

**Copy the reconnect/backoff behavior, don't just copy the subscribe call.**
The value of reusing `live-events.ts`'s pattern is inheriting its handling of
a dropped connection mid-stream — a naive new subscribe that doesn't retry
would silently stop a chat reply from updating after a network blip, exactly
the kind of thing that "looks done" until someone's wifi hiccups.

## Verification

- [ ] A subscribed test client receives a broadcast posted on
      `chat:<workspaceId>:<sessionId>` and does not receive one posted on a
      different session's topic (cross-session isolation, cheap to assert
      here even though the RLS-level cross-workspace proof is T-M12-06's).
- [ ] `pnpm --filter ui typecheck` and `pnpm --filter ui test` green.

## On completion

- [ ] Tick 12.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

<!-- Filled in when the task lands. -->
