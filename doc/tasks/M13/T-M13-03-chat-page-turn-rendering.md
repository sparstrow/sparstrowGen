# T-M13-03 — hooks split, and `chat.tsx` renders a turn instead of a mutation

| | |
|---|---|
| **Tag** | `[S]` sequential — the phase's one UI task, and it edits `packages/ui/src/api/hooks.ts` (~2100 lines, edited by most bands) plus `chat.tsx`, which the `chat-context-menu-design` worktree is also rewriting. See Traps. |
| **Serves** | **US1** — send a message and get a reply |
| **Depends on** | T-M13-01 (the HTTP contract), T-M13-02 (the local host's half of it) |
| **Blocks** | T-M13-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

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

### 3. `busy` is a union of server state and mutation state, not a branch between them

**Revised during implementation, by actually sending a second message in the
browser and watching the composer fail to disable.** The original plan here
was a branch — `turn ? isTurnBusy(turn) : isPending` — reasoned from "the
composer disables when the session's turn is `waiting`/`in_progress`, not
when a mutation happens to be pending." That is correct for the CLOUD path,
where `enqueue_chat_turn` returns almost immediately with a `waiting`/
`in_progress` row. It is wrong for the LOCAL path: the local Fastify route
does not resolve until the turn is fully terminal (DD-7 — "the local Fastify
route returns it already terminal"), so there is no intermediate row to
derive `isTurnBusy` from while it runs. Once `turn` already held a stale
SUCCEEDED turn from an earlier message in the same session, the branch's
`turn ? isTurnBusy(turn) : …` picked the `isTurnBusy` side and read `false`
for the ENTIRE duration of the next local send — the composer stayed enabled
and a second message could go out while the first was still running.

The fix ships as a plain OR — `isTurnBusy(turn) || postTurn.isPending ||
retryTurn.isPending || createSession.isPending` — plus nulling `turn`
optimistically the instant a new send/retry starts (`postTo`/`retry`, before
calling `.mutate`), so a stale terminal turn never coexists with an in-flight
mutation in the first place. `isTurnBusy(turn)` alone still covers the
original reload case this decision was written for: after a reload,
`isPending` resets to `false`, but a still-non-terminal turn arrives via
`activeTurn` and disables the composer on its own.

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

- [x] `mergeTurn` + unit tests in `packages/ui/src/lib/chat-turn-state.ts`
      (decision 2), including an out-of-order `seq` and a `turnId` switch —
      shipped as four focused functions (`applyChatTurnState`,
      `isBroadcastForHeldTurn`, `applyChatTurnBroadcast`, `isTurnBusy`)
      rather than one `mergeTurn`, since the three sources merge by different
      rules; 13 tests
- [x] Hook split and renames per decision 1; `agent-create.tsx` updated to the
      new names with **no other change**
- [x] `chat.tsx`: `pending` / `turnErrors` / `busy` replaced by the merged turn
- [x] `chat.tsx` subscribes via `useLiveEvents().subscribeChat(sessionId, …)`
      while the turn is non-terminal, and unsubscribes on unmount and on
      session change — subscribes whenever a session is open (not gated on
      turn status), since a broadcast for a turn this tab doesn't know about
      yet (another tab's retry) is exactly the case that needs a refetch
- [x] **Populated** — the reply renders and grows across broadcasts (proved
      live against the local host — see Result; cloud broadcast path is
      T-M13-05's)
- [x] **Empty** — unchanged, confirmed still renders on load
- [x] **Loading** — working indicator in the reply area, composer disabled for
      a second send — proved live, including the busy-derivation bug this
      found and fixed (decision 3)
- [x] **Error** — a `failed` turn shows plain language and the existing retry
      affordance, no raw error string
- [x] **Waiting** — decision 4's single generic state (not reachable without
      a paired machine on this host; code-reviewed, not clicked through)
- [x] A `409 turn_in_progress` from the server renders as the composer's
      refusal message, not a toast of a raw error — see Traps
- [x] Light and dark confirmed live; Mono surface not reached (needs a
      surface switch this pass didn't exercise) — carried to T-M13-05
- [x] `packages/ui` typecheck and tests green

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

- [x] `pnpm --filter @sparstrow/ui test` green, including the turn-state
      module's tests — 13/13
- [x] The Agent Creator interview still works end to end after the hook
      rename — click through `/agents/new`, do not just typecheck. Done live:
      two full interviews (starter-button send, real `claude-code` reply,
      follow-up questions rendered). A **pre-existing, unrelated** bug found
      in the process — see Result.
- [x] Populated / Empty / Loading / Error looked at live, both themes. Waiting
      is code-reviewed only (needs a paired machine — carried to T-M13-05).
      Mono surface not reached — carried to T-M13-05.
- [x] Two sends fired without waiting: the second is refused in the composer
      — proved live twice: once as the bug this exposed (composer failed to
      disable), once after the fix (composer correctly disabled, confirmed
      via `document.querySelector('textarea').disabled === true` mid-flight)
- [ ] The live streaming assertion and the US1 scenarios are **not** proved
      here — they need a paired machine and a deployed preview. That is
      [T-M13-05](T-M13-05-verification.md).

## On completion

- [x] Tick 18.9 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] `KnownGaps.md` entry if the local fallback-model affordance was lost
      (T-M13-02's trap) — not opened yet; the live pass didn't reach a failed
      local turn with a fallback offer to compare against. Left for
      T-M13-05, which does exercise a failed turn (stop-the-daemon case).

## Result

Shipped largely as designed, with one real bug found and fixed by actually
using the feature rather than only reading the diff — the kind of defect
`AGENTS.md` §3.10's browser-verification rule exists to catch before it ships.

**The bug:** `busy` was originally `turn ? isTurnBusy(turn) : isPending` (a
branch). Sending a first message in a session worked correctly. Sending a
**second** message in the same session did not disable the composer — found
by actually doing it in the browser and watching the composer stay live. Root
cause: on the local host, the POST doesn't resolve until the turn is fully
terminal (no intermediate `waiting`/`in_progress` row), so once `turn` held
the first message's SUCCEEDED result, the branch permanently picked
`isTurnBusy(turn)` (false) over `isPending` (true) for every subsequent send
in that session. Fixed two ways together: `busy` is now a union
(`isTurnBusy(turn) || postTurn.isPending || …`), and `postTo`/`retry` null
`turn` the instant a new send starts rather than leaving a stale terminal
turn in place. Full reasoning in decision 3, revised in place rather than
left to silently diverge from what shipped.

**A second, unrelated bug found in the same pass, NOT fixed here:**
[`BUG-2026-08-23-agent-creator-duplicate-user-bubble`](../../bug/BUG-2026-08-23-agent-creator-duplicate-user-bubble.md) —
a fresh Agent Creator interview briefly renders the owner's first message
twice. Confirmed via the daemon's own API that only one message is ever
persisted (a render race, not a double send) and confirmed, by inspection,
that this task's hook rename didn't touch the code path responsible
(`agent-create.tsx`'s own unguarded `pendingContent` render, present before
this task and unrelated to `chat-pending.ts`'s deletion). Filed per
`AGENTS.md` §5, not fixed, since `agent-create.tsx`'s own rendering is
explicitly out of this task's scope.

**`shouldShowPendingBubble` was deleted, deliberately** (`chat-pending.ts` +
its test) — its only caller was `chat.tsx`, which now dedupes by real message
id instead of the old content heuristic. `agent-create.tsx` never imported it
(confirmed by grep before deleting), so this is not the cause of the bug
above.

**Live-verified against a real local daemon** (`pnpm --filter core start` +
`pnpm --filter ui dev`, no cloud credentials needed for this host):
- A genuine `claude-code` CLI reply, reading live repo state correctly
  (confirmed the answer named this branch and named `ChatTurnState` as
  current work — not a canned response)
- FR-007: navigated away to `/agents` and back; the completed turn was fully
  recovered from `activeTurn`, no flash of the empty state
- FR-004: two real sends in the same session; the second was refused via the
  disabled composer (see the bug above for how this was actually proved, not
  assumed)
- No duplicate user bubble across three real sends (id-based dedup holds)
- Light and dark theme, both rendered correctly, no console errors in either
- Console clean throughout — page load, every send, every navigation

**Not reached this pass:** the cloud path (`apps/web`, Realtime broadcast,
multi-broadcast streaming), the three specific waiting states (M14's), and
the Mono surface. All three are T-M13-05's, which has a paired machine and a
deployed preview as prerequisites this pass didn't have.

`pnpm --filter @sparstrow/ui typecheck` clean. `pnpm -r typecheck` clean
across all 7 workspace packages. `pnpm -r test` green: shared 279, web 298,
ui 61, core 714 (5 new in `chat.test.ts` from T-M13-02, 13 new in
`chat-turn-state.test.ts` here).

<!-- Filled in when the task lands. -->
