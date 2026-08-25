# T-WA-07 — chat, messages

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; **owns** `app/chat/actions.ts`, which T-WA-03 also consumes |
| **Serves** | **foundational** — the newest code in the phase, shipped by M12–M15 |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Convert the chat surface's four writes and the messages page's two. This task
**owns** `app/chat/actions.ts`, which `T-WA-03` imports for `agent-create.tsx`.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/chat/chat.tsx`](../../../apps/web/src/app/chat/chat.tsx) | `useCreateChatSession`, `useUpdateChatSession`, `usePostChatTurn`, `useRetryChatTurn` |
| [`app/messages/messages.tsx`](../../../apps/web/src/app/messages/messages.tsx) | `useSendMessage`, `useMarkMessageRead` |

## Decisions already made

### This is the most recently verified code in the phase — a behaviour change here regresses a live proof

M13, M14 and M15 were verified in a real browser against real staging Postgres
(`T-M13-05`, `T-M14-03`, `T-M15-03`), and `T-M13-05` found a defect that 1000+
passing tests had not: `GET /chat/sessions/:id`'s response shape did not match
what `chat.tsx` read, which had made the entire cloud chat UI non-functional.

**The same class of mistake is available here.** The `ChatTurnState` shape
crossing an action boundary must be identical to what `usePostChatTurn` returns
today — `T-M13-01` defined it at the browser boundary deliberately.

### `usePostChatTurn` and `useRetryChatTurn` do not stream, which is why they convert cleanly

The turn is *enqueued*; its progress arrives over Realtime
(`LiveEventSource.subscribeChat`, `T-M12-05`). The write is a plain
request/response enqueue, which is exactly what a Server Action is for.

**Do not touch the subscription.** `apps/web/CLAUDE.md`'s streaming exception
is about the transport that delivers the reply, and that is unchanged by this
task.

### `T-WA-03` consumes this task's file

`useCreateChatSession` and `useUpdateChatSession` are also called from
`agent-create.tsx`. If `T-WA-03` ran first, `app/chat/actions.ts` already exists
with those two actions — extend it rather than replacing it, and delete the two
hooks here. If this task runs first, create them and leave the hooks in place
with a comment naming `T-WA-03` as the remaining consumer.

## Checklist

- [ ] `app/chat/actions.ts` — `createChatSessionAction`, `updateChatSessionAction`, `postChatTurnAction`, `retryChatTurnAction`
- [ ] `app/messages/actions.ts` — `sendMessageAction`, `markMessageReadAction`
- [ ] `chat.tsx` and `messages.tsx` call them under `useTransition`
- [ ] The Realtime subscription in `chat.tsx` is untouched
- [ ] Coordinate the `useCreateChatSession`/`useUpdateChatSession` deletion with T-WA-03
- [ ] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useChatSession`/`useChatSessions`/`useMessages` queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/chat.ts`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

## Traps

**The optimistic user message must survive.** `chat.tsx` shows the typed message
immediately, before the turn is enqueued. `useTransition` does not reproduce
that on its own — the local optimistic append has to stay exactly where it is.
Losing it makes chat feel broken in the precise way M13's verification pass
exists to prevent.

**The retry model picker passes a model id.** `T-M15-01` added it. The action's
argument must carry it; dropping it silently retries on the default model, which
looks like it worked and is not what the owner asked for.

**The three waiting-reason cards depend on the turn state the action returns.**
`T-M14-01` distinguishes TTL-expiry from a real failure. An action that
collapses those into one error string destroys that distinction — which was
itself the subject of a verification scenario (`T-M14-03`, scenario 2b).

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [ ] `grep -rn "usePostChatTurn\|useRetryChatTurn\|useSendMessage\|useMarkMessageRead" apps/web/src` returns nothing
- [ ] Send a chat turn: the optimistic message appears instantly, the turn enqueues, and the reply arrives over Realtime as before
- [ ] Retry a turn with a **different** model selected, and confirm the retry used it
- [ ] Send a turn with no machine online: the waiting-reason card from `T-M14-01` still renders, and still tells TTL-expiry apart from a failure
- [ ] Send and read a message on `/messages`; the unread count updates
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/chat` or `/api/v1/messages`

## On completion

- [ ] Tick 22.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
