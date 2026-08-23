# BUG-2026-08-23-agent-creator-duplicate-user-bubble

**Status:** 🔴 open
**Reported by:** agent — found while running the browser-verification pass for
[T-M13-03](../tasks/M13/T-M13-03-chat-page-turn-rendering.md)'s regression
check ("the Agent Creator still completes an interview, on the local host").
Not introduced by that task — T-M13-02/03 only renamed
`usePostChatTurn`/`useRetryChatTurn` to `useAgentDraftTurn`/`useRetryAgentDraftTurn`
for this page, with no change to `mutationFn` or `onSuccess`, and the bug
reproduces identically before and after that rename by inspection of the
unedited code path.

**Reported:** 2026-08-23

## Symptom

Starting a brand-new Agent Creator interview (either by clicking one of the
four starter suggestions or by typing a first message) briefly shows the
owner's own message rendered **twice**, stacked, followed by the working
indicator — before settling to the correct single exchange once the reply
arrives.

## Reproduction

1. Go to Agents → New agent → "Create with Agent Creator" (a fresh,
   never-used session).
2. Click any starter button, e.g. "Create a research assistant that can
   search the web".
3. Screenshot immediately (within roughly the first second).

**Expected:** one user bubble, then a working indicator.
**Observed:** the identical user bubble twice, then the working indicator.

Confirmed via the local daemon's own API that this is a rendering artifact,
not a double insert — `GET /api/v1/chat/sessions/:id` for the affected
session returns exactly **one** user message and **one** assistant message
once the turn completes:

```json
[
  {"role":"user","content":"Create a research assistant th…"},
  {"role":"assistant","content":"A web research assistant can m…"}
]
```

Reproduced twice, cleanly, from a fresh session each time (including once
with zero other interaction beforehand) — not a fluke of overlapping earlier
actions.

## Investigation

`packages/ui/src/routes/pages/agent-create.tsx` renders two independent,
un-deduplicated sources for the same text:

```tsx
messages.map((m) => <ChatTurnView key={m.id} message={m} />)
...
{pendingContent && (
  <ChatTurnView message={{ role: "user", content: pendingContent, meta: null }} />
)}
```

`pendingContent` is set optimistically in `send()`
(`agent-create.tsx:151-181`) and cleared only in `applyTurnResult`, called
from the mutation's `onSuccess` — i.e. once the ENTIRE turn (including the
model's reply) has finished. Meanwhile `packages/core/src/chat/service.ts`'s
`postChatTurn` persists the user `chat_messages` row **before** running the
model (the same ordering `chat-pending.ts`'s doc comment described for
`chat.tsx`, verbatim: *"The server persists the user row before running the
model ... and the turn can take minutes, so any refetch inside that window
returns a transcript that already contains the message the optimistic bubble
is still showing"*). For a first message specifically, `useChatSession(sessionId)`
mounts the instant `createSession`'s `onSuccess` sets `sessionId` — a refetch
racing that window is near-certain, exactly the "near-certain" case
`chat-pending.ts` called out.

**This is intake 0008's exact bug** (the one `shouldShowPendingBubble` /
`chat-pending.ts` was written to fix for `chat.tsx`), on the sibling page that
never got the same fix. Confirmed by grep, before this bug existed: only
`chat.tsx` ever imported `shouldShowPendingBubble` — `agent-create.tsx`'s
`pendingContent` never had a dedup guard.

**Ruled out:** a double POST. Confirmed via direct `fetch()` against the
local daemon's own `GET /api/v1/chat/sessions/:id` in the browser console —
exactly one user row and one assistant row per affected session, both times
reproduced.

**Not caused by M13.** `chat-pending.ts`/`shouldShowPendingBubble` were
deleted in T-M13-03 as part of rebuilding `chat.tsx`'s own turn rendering
(replaced there with an exact id-based dedup against `messages`, which is
more robust than the old content-heuristic). That deletion has no effect on
`agent-create.tsx`, which never imported the file. The Agent Creator's
`pendingContent` logic is untouched by M13 and was already unguarded before
it.

## Impact

Cosmetic, self-correcting (resolves the instant the turn completes,
typically within a few seconds to under a minute for a real CLI call), and
scoped to the first render of a message before its round trip finishes — not
a data-integrity issue and not something that compounds turn over turn (only
reproduces on THIS turn's own send, not on messages already in history).
Confusing enough on a slow/hung model call that a user might think their
message sent twice. No workaround needed since it clears on its own; nothing
blocks the interview from proceeding correctly.

## Resolution

Not fixed here — out of scope for M13, which explicitly keeps the Agent
Creator page's own logic unchanged (per the M13 plan's Scope boundaries: "The
local, core-served UI's chat is not re-architected"). The fix is
small and known: give `agent-create.tsx`'s `pendingContent` the same
id-aware guard `chat.tsx` now uses (drop the bubble once `messages` already
contains a user row with matching content/position — or the cheaper fix,
reuse `shouldShowPendingBubble`'s content-heuristic form before concluding
it's obsolete everywhere, since this page's session id is momentarily fresher
than `chat.tsx`'s ever was). Whoever picks this up should open a small task
in `doc/tasks/` linked back to this id rather than folding it into an
unrelated change.
