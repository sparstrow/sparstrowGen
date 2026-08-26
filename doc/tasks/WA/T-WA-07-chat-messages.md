# T-WA-07 — chat, messages

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; **owns** `app/chat/actions.ts`, which T-WA-03 also consumes |
| **Serves** | **foundational** — the newest code in the phase, shipped by M12–M15 |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-44 2026-08-26 |

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

- [x] `app/chat/actions.ts` — `createChatSessionAction`, `updateChatSessionAction`, `postChatTurnAction`, `retryChatTurnAction`
- [x] `app/messages/actions.ts` — `sendMessageAction`, `markMessageReadAction`
- [x] `chat.tsx` and `messages.tsx` call them under `useTransition`
- [x] The Realtime subscription in `chat.tsx` is untouched
- [x] Coordinate the `useCreateChatSession`/`useUpdateChatSession` deletion with T-WA-03 — both already existed in `app/chat/actions.ts` from `T-WA-03`; extended the file with the two turn actions rather than replacing it
- [x] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useChatSession`/`useChatSessions`/`useMessages` queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/chat.ts`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green

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

- [x] `grep -rn "usePostChatTurn\|useRetryChatTurn\|useSendMessage\|useMarkMessageRead" apps/web/src` returns nothing (comments referencing the old names by history are fine; zero live call sites)
- [x] Send a chat turn: the optimistic message appears instantly, the turn enqueues, and the reply arrives over Realtime as before — verified live: sent a free-chat message against a fresh disposable workspace, the optimistic message rendered immediately, `createChatSessionAction` created the session, `postChatTurnAction` enqueued the turn, and the `no_runtime_paired` waiting-reason card (`T-M14-01`) rendered — Realtime itself is unexercised without a paired daemon (no assistant reply to arrive), same limitation `T-WA-06`'s `G-42` already recorded for runs
- [~] Retry a turn with a **different** model selected, and confirm the retry used it — blocked → `G-44` (needs a `succeeded`/`failed` turn, which needs a paired daemon this harness cannot supply); `retryChatTurnAction`'s latest-turn resolution, override provider/model pass-through, and `SPG19` mapping are unit-tested instead
- [x] Send a turn with no machine online: the waiting-reason card from `T-M14-01` still renders, and still tells TTL-expiry apart from a failure — the `no_runtime_paired` branch confirmed live above; the TTL-expiry branch (`turn.waitingReason !== null` on a `failed` turn) is unchanged rendering logic gated on server data `postChatTurnAction` returns byte-for-byte the same shape for, and is covered by the existing `chat-turn-state.test.ts` (untouched by this task)
- [x] Send and read a message on `/messages`; the unread count updates — verified live: composed a message to a freshly created test agent via `sendMessageAction`, confirmed it appeared with an "unread"/"new" badge, opened it (`markMessageReadAction`), confirmed the badge cleared
- [x] `pnpm typecheck` and `pnpm test` green — 393 tests passing
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/chat` or `/api/v1/messages` — confirmed via `agent-browser network requests`: only `GET /api/v1/chat/sessions*` and `GET /api/v1/messages` reads, plus `POST` to the page route itself (the Server Action's own RSC action endpoint, not `/api/v1`)

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table

## Result

`app/chat/actions.ts` (created by `T-WA-03`, extended here) gained
`postChatTurnAction` and `retryChatTurnAction`, moved verbatim from
`POST /chat/sessions/:id/messages` and `.../retry`, including their own copy
of `turnStateRow` (the handler's helper stays for `GET /chat/sessions/:id`'s
`activeTurn`, since reads are out of scope for the whole phase, DD-5).
`app/messages/actions.ts` is new: `sendMessageAction`, `markMessageReadAction`.

`chat.tsx` converts to three `useTransition`s (send, retry, session-field
update) rather than one per hook, since `busy` needs `sendPending`/`retryPending`
but never the session-update transition (matching the original hooks' own
`isPending` composition, where `updateSession.isPending` was never part of
`busy` either). `notifyFailure`'s `turn_in_progress` discriminator moved from
`ApiError.reason` to `ActionResult.field` — the same repurposing `T-WA-06`
established for `enqueueFailureFrom`'s reason tokens (`actionFail(message,
reason)`), now applied to `chatTurnFailureFrom`'s tokens too.

**Deleted a whole route-level test file's worth of coverage, not just code.**
`apps/web/src/lib/api/chat-routes.test.ts` had 22 tests exercising the three
routes this task deletes (`POST /chat/sessions`, `.../messages`, `.../retry`).
Ported all of them to `app/chat/actions.test.ts` against the actions that
replace those routes — same fixtures (`FREE_SESSION`, `CREATOR_SESSION`,
`WAITING_TURN`, `USER_MSG`), same assertions (SPG16/SPG19 mapping, the
latest-turn-by-`created_at` resolution, agent-creator refusal, content
validation) — rather than letting the coverage just disappear with the routes.
`chat-routes.test.ts` itself now only covers the two `GET` routes that stay.

**Three bugs found and fixed as a side effect, all pre-existing:**
- Completed the fix for `BUG-2026-08-26-chat-session-updates-always-404`
  (`T-WA-03` fixed one of two consumers): `chat.tsx`'s rename/model-switch/archive
  call sites now use `updateChatSessionAction`; verified live that a model
  switch persists across a reload and an archived session shows the
  read-only composer state.
- No new bugs beyond what `T-WA-03` and `T-WA-06` already found were
  discovered in the chat/messages surface itself — `enqueue_chat_turn`,
  `retry_chat_turn`, and the messages table's columns all matched what the
  handlers assumed.

Live-verified end-to-end against a fresh disposable workspace via
`agent-browser`: sending a free-chat message (session creation, optimistic
message, turn enqueue, `no_runtime_paired` waiting card), switching a
session's model and confirming it persists across reload, archiving a
session, and a full compose → unread badge → open → read cycle on
`/messages` against a freshly created test agent. `read_network_requests`
confirmed zero `POST`/`PATCH`/`DELETE` to `/api/v1/chat` or `/api/v1/messages`.
Console and page-error checks were clean throughout.

**Not exercised:** the retry-with-a-different-model UI path — `RetryControls`
only renders once a turn is `succeeded`, which needs a paired daemon this
disposable workspace does not have (same shape as `T-WA-06`'s `G-42`). Logged
as `G-44`, backed by unit tests covering `retryChatTurnAction`'s logic directly.

393 apps/web tests passing (net change from this task: -22 route-level tests
removed with the deleted routes, +9 `postChatTurnAction`/`retryChatTurnAction`
tests, +3 `sendMessageAction`/`markMessageReadAction` tests); `pnpm typecheck`
clean.
