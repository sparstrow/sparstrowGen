# T-M13-03 — hooks split, and `chat.tsx` renders a turn instead of a mutation

| | |
|---|---|
| **Tag** | `[S]` sequential — the phase's one UI task, and it edits `packages/ui/src/api/hooks.ts` (~2100 lines, edited by most bands) plus `chat.tsx`, which the `chat-context-menu-design` worktree is also rewriting. See Traps. |
| **Serves** | **US1** — send a message and get a reply |
| **Depends on** | T-M13-01 (the HTTP contract), T-M13-02 (the local host's half of it) |
| **Blocks** | T-M13-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> **US1 scenario 1** — **Given** a Free chat session and an online paired
> machine, **When** the owner sends "what does this repo do?", **Then** the
> composer shows the turn is in progress, and the agent's reply appears in the
> session, growing as it's produced.
>
> **US1 scenario 4** — **Given** a turn is already in progress in a session,
> **When** the owner tries to send a second message before the first reply
> finishes, **Then** the composer refuses ("wait for the current reply, or send
> after it finishes") rather than silently queuing or overwriting it.

Scenarios 2 and 3 (Project directives, Agent provider/model) are satisfied by
the daemon-side work M12 already landed; this task must simply not obscure
them — see T-M13-05 §A.

## Objective

Move `chat.tsx` off the synchronous `ChatTurn` mutation result and onto a turn
whose state arrives from three sources — the send response, the session read,
and the live broadcast — merged in one place. The composer's disabled state,
the working indicator, and the failure banner all become functions of that turn
rather than of `mutation.isPending`.

## Decisions already made

### 1. The hooks split by caller, and the Agent Creator's get Agent-Creator names

Per [T-M13-02](T-M13-02-local-host-turn-state.md) decision 1,
`agent-create.tsx` and `chat.tsx` need different response shapes and are
currently sharing all three hooks. The split:

| Hook | Returns | Caller |
|---|---|---|
| `usePostChatTurn` | `ChatTurnState` | `chat.tsx` |
| `useRetryChatTurn` | `ChatTurnState` | `chat.tsx` |
| `useAgentDraftTurn` *(new name)* | `ChatTurn` | `agent-create.tsx` |
| `useRetryAgentDraftTurn` *(new name)* | `ChatTurn` | `agent-create.tsx` |
| `useChatSession` | `ChatSessionDetail` (now with `activeTurn`) | both — additive, `agent-create.tsx` ignores it |

**Rename rather than add.** The general names keep describing the general
feature, and the Agent-Creator-specific path gets a name that says so. Renaming
also makes the compiler visit every call site — safer than changing a return
type under an unchanged name, which would leave `agent-create.tsx` type-clean
against a shape it no longer receives.

Both new hooks post to the same URLs as before; the name describes the caller's
intent, not the endpoint.

### 2. One merge point for turn state, not three pieces of component state

Today `chat.tsx` holds `pending`, `turnErrors` and a derived `busy`
(lines 199–206) — three independent bits that the server can contradict. The
turn arrives from three places and they merge in one hook:

```ts
// packages/ui/src/lib/chat-turn-state.ts (new)
/** Newest-wins by (turnId, replySeq). The three sources:
 *   - `detail.activeTurn`  — authoritative on mount and after a refetch
 *   - the send/retry POST  — authoritative the instant it returns
 *   - subscribeChat deltas — authoritative while the turn is non-terminal
 *  A broadcast for a DIFFERENT turnId than the one held replaces it: the
 *  session topic outlives any single turn (see chatTurnTopic's doc comment). */
export function mergeTurn(current: ChatTurnState | null, incoming: …): ChatTurnState | null
```

Written as a pure function in its own file so the ordering rules are unit
testable without mounting the page — the same reason `chat-pending.ts` and
`enqueue.ts` are separate.

`ChatTurnBroadcast` carries `{ turnId, events: [{seq, replyText}], status,
error }`, and `replyText` is **the full text so far, never a delta** — so the
merge is a `seq` comparison and an assignment, not a concatenation. Read
`ChatTurnEventPush`'s doc comment in `packages/shared/src/cloud.ts` before
writing it.

### 3. `busy` is derived from the turn's status; `isPending` covers only the request in flight

The composer disables when the session's turn is `waiting` or `in_progress` —
**not** when a mutation is pending. `isPending` is per-tab, per-mutation state
that a reload resets while the server's turn is still running, which is exactly
the stale-state failure the phase README's Traps name. `isPending` keeps one
narrow job: the brief window between clicking send and the POST returning,
before any turn exists to derive from.

### 4. M13 renders ONE generic waiting state; M14 owns the three specific ones

`waitingReason` is already populated by M12's SQL and already in
`chatTurnStateSchema`. This task must render a `waiting` turn as *waiting* —
"waiting for a machine to pick this up", composer disabled, message visible and
not lost — and must **not** render it as an error or as a frozen pane.

Building the three distinct, actionable cards with their pairing links
(`no_runtime_paired` / `all_runtimes_offline` / `project_not_available`) is
[M14](../M14/README.md), which is graded on SC-002. Do not build them here, and
do not leave `waiting` falling through to the error branch — a legible interim
state now, replaced by M14's specific ones, is the correct increment.

### 5. Streaming is described as what it is

Per [`G-30`](../../KnownGaps.md), the pipe delivers **whole assistant messages
and step updates, not token deltas**. A short answer with no tool calls arrives
as one block. The working indicator must therefore be honest about elapsed
progress rather than animating a fake typing effect over already-complete text
— synthesizing deltas is named and rejected in DD-5 ("an animation that lies
about what the machine is doing"). `ThinkingDots` already exists and is the
right primitive.

## Checklist

- [ ] `mergeTurn` + unit tests in `packages/ui/src/lib/chat-turn-state.ts`
      (decision 2), including an out-of-order `seq` and a `turnId` switch
- [ ] Hook split and renames per decision 1; `agent-create.tsx` updated to the
      new names with **no other change**
- [ ] `chat.tsx`: `pending` / `turnErrors` / `busy` replaced by the merged turn
- [ ] `chat.tsx` subscribes via `useLiveEvents().subscribeChat(sessionId, …)`
      while the turn is non-terminal, and unsubscribes on unmount and on
      session change
- [ ] **Populated** — the reply renders and grows across broadcasts
- [ ] **Empty** — a fresh session keeps its context-appropriate prompt (the
      "What are we working on?" pane already does this; do not regress it)
- [ ] **Loading** — working indicator in the reply area, composer disabled for
      a second send
- [ ] **Error** — a `failed` turn shows plain language and the existing retry
      affordance, no raw error string
- [ ] **Waiting** — decision 4's single generic state
- [ ] A `409 turn_in_progress` from the server renders as the composer's
      refusal message, not a toast of a raw error — see Traps
- [ ] Both light and dark, at Paper and Mono surfaces (`AGENTS.md` §3.11)
- [ ] `packages/ui` typecheck and tests green

## Traps

**`chat.tsx` is being rewritten in another worktree right now.** The
`chat-context-menu-design-0eb2ff` worktree (branch
`claude/chat-context-menu-design-0eb2ff`, commit `513c0fd`) adds ~205 lines to
`packages/ui/src/routes/pages/chat.tsx` for a right-click session menu, and
also touches `chat-and-inbox.md`, which [T-M13-04](T-M13-04-knowledge-center.md)
edits. **Check whether it has landed on `development` before starting**, and
rebase rather than resolving a 200-line conflict at PR time. This is the
concrete reason this task is `[S]` and not `[P]`.

**`shouldShowPendingBubble` was written for a race that no longer happens the
same way.** Read `packages/ui/src/lib/chat-pending.ts`: it exists because
`postChatTurn` persists the user row *before* running the model, so a refetch
mid-turn returned a transcript already containing the message the optimistic
bubble was still showing (intake 0008). On the cloud path
`enqueue_chat_turn` inserts the user `chat_messages` row **inside the same
transaction as the turn**, and the POST returns that row as
`ChatTurnState.userMessage` — so the "real" message is available immediately
and the optimistic bubble has nothing left to do. Deleting it is likely
correct; deleting it *without checking the local host* is not, because
service.ts still has the original ordering. Decide deliberately and leave a
comment either way.

**The `turnErrors[""]` empty-string key is load-bearing today.** `chat.tsx`
line 631 renders a banner keyed on `""` for the case where session *creation*
failed and there is no session id yet (line 261's `failLocal("", err.message)`).
That is a create-session failure, not a turn failure, and it has no turn to
merge into. Keep a separate piece of state for it rather than folding it into
the turn — otherwise a failed "New chat" silently shows nothing.

**Do not disable the composer on `waiting` forever.** `CHAT_TURN_WAIT_TTL_MS`
is 24 hours (`packages/shared/src/cloud.ts:737`). A turn parked overnight
would leave the composer dead with no way out. M14 owns the expiry state, but
this task must not ship a composer that can be permanently locked by a waiting
turn with no visible reason — at minimum the waiting state names what is
happening, which decision 4 already requires.

**`subscribeChat` is per SESSION, not per turn.** A broadcast can arrive for a
turn other than the one being held — a retry sent from another tab, for
instance. `mergeTurn` handles it (decision 2); the subscription must not be
keyed on turn id or it will resubscribe on every retry and miss deltas in the
gap.

## Verification

- [ ] `pnpm --filter @sparstrow/ui test` green, including `mergeTurn`'s tests
- [ ] The Agent Creator interview still works end to end after the hook rename
      — click through `/agents/new`, do not just typecheck
- [ ] All four states plus waiting, looked at in a browser, both themes
- [ ] Two sends fired without waiting: the second is refused in the composer,
      with the server's 409 as the source of truth
- [ ] The live streaming assertion and the US1 scenarios are **not** proved
      here — they need a paired machine and a deployed preview. That is
      [T-M13-05](T-M13-05-verification.md).

## On completion

- [ ] Tick 18.9 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] `KnownGaps.md` entry if the local fallback-model affordance was lost
      (T-M13-02's trap)

## Result

<!-- Filled in when the task lands. -->
