# T-M13-01 — `ChatTurnState` at the browser boundary: the two v1 routes and the session read

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the HTTP contract T-M13-02 and T-M13-03 are written against, and edits `packages/shared/src/schemas/chat.ts`, which both also consume |
| **Serves** | **US1** — send a message and get a reply |
| **Depends on** | — (M12 landed everything this calls) |
| **Blocks** | T-M13-03, T-M13-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

> **US1 scenario 4** — **Given** a turn is already in progress in a session,
> **When** the owner tries to send a second message before the first reply
> finishes, **Then** the composer refuses ("wait for the current reply, or
> send after it finishes") rather than silently queuing or overwriting it.

This task owns the **server half** of scenario 4 — the refusal arriving as a
legible, switchable failure instead of a 500 — and the transport scenarios 1–3
ride on. The composer's rendering of it is T-M13-03's.

## Objective

Retire the two `stubs.ts` patterns for `POST /chat/sessions/:id/messages` and
`.../retry`, replacing them with handlers that call M12's already-live
`enqueue_chat_turn` / `retry_chat_turn` functions and return a `ChatTurnState`.
Make `GET /chat/sessions/:id` carry the session's active turn, so a reply
survives a reload. Nothing renders yet — this task ends at a `curl`-able
contract.

## Decisions already made

Phase decisions 1 (both stubs retired here), 3 (`ChatSessionDetail` gains
`activeTurn`) and 6 (agent-creator keeps a 501) are the phase README's and are
cited, not restated. What follows is settled inside this task.

### 1. The errcode→HTTP mapping is a second function in `enqueue.ts`, not a new file

`apps/web/src/lib/api/enqueue.ts` already exists to do exactly this job for
`start_run`/`cancel_run`, and its own doc comment frames it generally
("translating that function's error contract into HTTP … pure and separate from
the handlers so the mapping is testable without standing up a supabase
client"). Chat's four SQLSTATEs are the same shape of thing, and
`CHAT_TURN_ENQUEUE_ERRCODE_REASONS` in `@sparstrow/shared` is already the token
map. Add a sibling export rather than a parallel file:

```ts
// apps/web/src/lib/api/enqueue.ts
import { CHAT_TURN_ENQUEUE_ERRCODE_REASONS, type ChatTurnEnqueueFailureReason } from "@sparstrow/shared";

export interface ChatTurnFailure {
  status: number;
  reason: ChatTurnEnqueueFailureReason;
  message: string;
}

/** Same rule as STATUS_BY_REASON above: 404 for "does not exist", 409 for
 *  "exists, but not in a state that can run right now". */
const CHAT_STATUS_BY_REASON: Record<ChatTurnEnqueueFailureReason, number> = {
  turn_in_progress:   409,
  session_not_found:  404,
  turn_not_found:     404,
  turn_not_retryable: 409,
};

export function chatTurnFailureFrom(error: unknown): ChatTurnFailure | null { /* … */ }
```

**Returns `null` for anything unrecognised, and the caller rethrows** — the
identical rule `enqueueFailureFrom` documents. A dropped connection laundered
into a tidy 409 would tell the owner their session is busy when the truth is
that the database is down.

`turn_in_progress` is **409, not 400**: nothing about the request is malformed.
The session is in a state that conflicts with the ask, and the fix is an action
the owner takes (wait, or send after it finishes) — enqueue.ts's own reasoning
for why `no_runtime_available` is a 409, applied unchanged.

### 2. One mapper builds `ChatTurnState`, and all three routes call it

Three routes must produce the same shape, so the row→state conversion is
written once, in `apps/web/src/lib/api/handlers/chat.ts`, and not inlined three
times:

```ts
/** A `chat_turns` row (snake, as returned by the RPCs' `to_jsonb`) plus the
 *  messages that belong to it, shaped into the ChatTurnState contract.
 *  Returns the row still in snake_case — `ok()` camelizes on the way out. */
async function turnStateRow(supabase, workspaceId, turnRow) { /* … */ }
```

`chatTurnStateSchema` requires a **non-null `userMessage`**, and the RPCs return
only the turn row. The mapper therefore reads `chat_messages` by
`turn_id` — the FK and `idx_chat_messages_turn` index both already exist for
this — taking the `role = 'user'` row as `userMessage` and the `role =
'assistant'` row, when present, as `assistantMessage`.

### 3. `GET /chat/sessions/:id` returns the *active or most recent* turn, not just an active one

FR-007 ("a turn in progress must be recoverable if the owner navigates away and
returns") cannot be served by the mutation response — that response is gone
after a reload. The session read is the only thing a remounting page has.

The field carries the session's **latest** turn by `created_at`, not strictly a
non-terminal one, because T-M13-03 also needs the just-finished turn's `error`
to render a failed turn after a reload, and M15 needs a terminal turn's id to
retry it. `status` already tells a consumer which case it has.

```ts
// packages/shared/src/schemas/chat.ts
export interface ChatSessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
  /** M13 — the session's most recent turn, or null if none was ever sent.
   *  Terminal or not; `status` distinguishes them. The local host always
   *  reports a terminal turn here (T-M13-02). */
  activeTurn: ChatTurnState | null;
}
```

### 4. `POST /messages` on an `agent-creator` session keeps a 501

`enqueue_chat_turn`'s own header comment is explicit that it does not accept
agent-creator sessions' `draft` payload and that **the calling route** is what
must not call it for one ("nothing here re-derives that check, to avoid a
second copy of the session-kind branching apps/web already has to do"). The
plan's Scope boundaries agree: agent-creator sessions keep the local path, and
`POST /agents/draft` is a separate stub.

So the handler reads the session's `kind` first and, for `agent-creator`,
returns the same legible 501 `needsRuntimeError` produces today rather than
enqueuing a turn whose executor would ignore the draft. **This is a deliberate
refusal that T-M13-05 §B asserts still refuses** — not an oversight to be
"fixed" by a later reader.

## Checklist

- [ ] Remove the `/chat/sessions/:id/messages` and `/chat/sessions/:id/retry`
      rows from `needsRuntimePatterns` in
      `apps/web/src/lib/api/handlers/stubs.ts`. Leave
      `/teams/:id/manager/chat` exactly as it is — it is out of this spec's
      scope and its stub is still true.
- [ ] `chatTurnFailureFrom` + `CHAT_STATUS_BY_REASON` in
      `apps/web/src/lib/api/enqueue.ts`, per decision 1
- [ ] Unit tests for it beside the existing `enqueueFailureFrom` tests: one per
      SQLSTATE, plus "unrecognised error returns null"
- [ ] `activeTurn` added to `ChatSessionDetail` in
      `packages/shared/src/schemas/chat.ts` (decision 3)
- [ ] `turnStateRow` mapper in `apps/web/src/lib/api/handlers/chat.ts`
      (decision 2)
- [ ] `POST /chat/sessions/:id/messages` — agent-creator guard (decision 4),
      then `supabase.rpc("enqueue_chat_turn", { p_session_id, p_content })`,
      then the mapper. Errors through `chatTurnFailureFrom`, rethrowing `null`.
- [ ] `POST /chat/sessions/:id/retry` — resolves the session's latest turn id,
      then `supabase.rpc("retry_chat_turn", { p_turn_id, p_provider, p_model })`,
      same error handling
- [ ] `GET /chat/sessions/:id` returns `activeTurn`
- [ ] `GET /chat/sessions/:id` passes its opaque keys to `ok()` — see Traps
- [ ] `apps/web` and `packages/shared` typecheck and tests green

## Traps

**`handleError` has no branch for `SPG16`–`SPG19`, so an unmapped chat errcode
is a 500 reading "Internal Server Error".** Read
`apps/web/src/lib/api/router.ts:125–148`: it maps `PGRST116`, `PGRST204`,
`42703`, `42501`, `23505`, `23503`, and falls through to 500. FR-004's whole
requirement is that a second send refuses *legibly* — if `chatTurnFailureFrom`
is not wired in, or the handler forgets to call it, the feature fails in
exactly the way the spec forbids ("no raw error strings") while still looking
plumbed. **Assert the 409 by actually firing two sends**, not by reading the
code.

**`retry_chat_turn` takes a TURN id; the route's pattern carries a SESSION
id.** Read the signature: `retry_chat_turn(p_turn_id, p_provider, p_model)`.
The existing UI hook posts to `/chat/sessions/:id/retry`, so the handler must
resolve session → latest turn itself. Passing `params.id` straight through
yields `SPG18 turn_not_found` on every retry — a failure that looks like a
missing row rather than a wrong argument.

**`GET /chat/sessions/:id` currently passes no opaque keys, and `deepConvert`
recurses.** Line 137 of `handlers/chat.ts` calls `ok({...session, messages})`
with no second argument, so `chat_sessions.draft` and every
`chat_messages.meta` are being key-camelized inside their jsonb payloads
today — a latent bug this task's edit sits directly on top of. Nesting a turn
(whose `userMessage.meta` is also jsonb) makes it worse. Pass
`[...OPAQUE_COLUMNS.chat_sessions, ...OPAQUE_COLUMNS.chat_messages]`; the
matcher is depth-agnostic (`opaqueKeys.includes(snakeKey)` at any level), so
one flat list covers the nesting. `chat_turns` itself needs no entry — its
`error` is `text`, not jsonb, which is why DD-8's `OPAQUE_COLUMNS.chat_turns`
row was never added.

**`enqueue_chat_turn` never raises for "nothing is online".** It returns a
`waiting` row with a `waiting_reason` instead — DD-3, and the function's own
header says so. A handler that treats "no runtime" as an error path reproduces
the `409 no_runtime_available` behaviour US2.2 exists to overturn, and would
lose the owner's typed message. There are exactly four error cases here, and
they are the four SQLSTATEs.

**Do not add a read-then-write "is a turn already in flight?" check.** The
partial unique index on `session_id` is the guard (M12 phase trap; M2's defect
9 is the precedent). The handler relies on the insert failing and maps `SPG16`.

## Verification

- [ ] `pnpm --filter @sparstrow/shared test` and `pnpm --filter web test` green
- [ ] Unit: each of `SPG16`/`SPG17`/`SPG18`/`SPG19` maps to its
      documented status and reason token; an arbitrary `{code:"08006"}`
      returns `null`
- [ ] Against a real workspace, `POST /api/v1/chat/sessions/<id>/messages`
      returns a `ChatTurnState` that `chatTurnStateSchema.parse` accepts —
      parse it, do not eyeball it
- [ ] The same POST fired twice without waiting returns `200` then `409` with
      `reason: "turn_in_progress"` — **not** a 500
- [ ] `POST .../messages` against an `agent-creator` session returns 501 with
      its message intact
- [ ] `GET /api/v1/chat/sessions/<id>` carries `activeTurn`, and its
      `userMessage.meta` (if any) still has its original inner keys
- [ ] Full end-to-end reply flow is **not** proved here — it needs a paired
      machine and the UI. That is [T-M13-05](T-M13-05-verification.md).

## On completion

- [ ] Tick 18.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
