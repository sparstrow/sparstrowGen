# T-M13-02 — the local host answers in the same shape

| | |
|---|---|
| **Tag** | `[P]` parallel — lives entirely in `packages/core/src/{api/routes,chat}`; T-M13-01 is `apps/web/*` + `packages/shared/*`, T-M13-03 is `packages/ui/*`. Zero file overlap. |
| **Serves** | **US1** — send a message and get a reply |
| **Depends on** | — (`chatTurnStateSchema` already exists; M12-02 landed it) |
| **Blocks** | T-M13-03, T-M13-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

Make the local, core-served UI's `POST /chat/sessions/:id/messages` and
`.../retry` return a `ChatTurnState` — already terminal, assistant message
attached — for `free` / `project` / `agent` sessions, so `chat.tsx` has one
render path rather than a branch on which host it is running in (DD-7). Leave
the Agent Creator's path untouched.

## Decisions already made

### 1. DD-7 is narrowed to the sessions this spec covers, and agent-creator keeps `ChatTurn`

DD-7 says "one async shape used by both" hosts. Taken literally that means
every caller of `POST /chat/sessions/:id/messages` moves to `ChatTurnState`.
**That breaks the Agent Creator**, and decomposition found it by reading the
callers rather than the plan:

`packages/ui/src/routes/pages/agent-create.tsx` calls the *same three hooks*
`chat.tsx` does (`usePostChatTurn`, `useRetryChatTurn`, `useChatSession`) and
reads `turn.draftTurn` off the response at lines 141–146 to drive the interview
— applying the draft, the matches, and the followups. `ChatTurnState` has no
`draftTurn` field and should not grow one: a draft is a local-only,
non-dispatched concern, and the plan's Scope boundaries already say
agent-creator sessions keep the local path entirely.

So the narrowing, and why it still honours DD-7:

- `free` / `project` / `agent` sessions return **`ChatTurnState` on both
  hosts**. This is the feature this spec covers, and it is one shape across
  both hosts — the property DD-7 actually wanted.
- `agent-creator` sessions return **`ChatTurn`, unchanged, on the local host**,
  and a legible 501 on the cloud host (T-M13-01 decision 4). Same as today on
  both.

DD-7's stated reason for rejecting a discriminated union was that
`packages/ui` would otherwise have to ask "am I hosted?", which `live-events.ts`
documents as the question a component must never ask. **That property is
preserved**: the split here is by *session kind*, which each page already knows
statically — `agent-create.tsx` only ever opens agent-creator sessions,
`chat.tsx` never does. Neither page branches on host, and neither sees the
other's shape. T-M13-03 completes this by giving the two pages separate hooks.

### 2. The route branches, `runTurn` does not

`postChatTurn` / `retryChatTurn` in `packages/core/src/chat/service.ts` keep
returning `ChatTurn` — they are the local turn logic and four of their return
sites already build that shape (lines 355, 375, 430, 445). The adaptation is a
thin, testable function at the route boundary:

```ts
// packages/core/src/api/routes/chat.ts
/** A finished local ChatTurn, in the async contract's clothes. The local
 *  daemon answered in-process, so this is always terminal — there is nothing
 *  to subscribe to, which is exactly what WsHubLiveEventSource.subscribeChat's
 *  documented no-op relies on. */
function asTurnState(turn: ChatTurn): ChatTurnState { /* … */ }
```

Field mapping, fixed here so it is not re-derived:

| `ChatTurnState` | From a local `ChatTurn` |
|---|---|
| `id` | the assistant message's id, or the user message's — a local turn has no turn row; see Traps |
| `status` | `error ? "failed" : "succeeded"` — never `waiting`/`in_progress` |
| `waitingReason` | always `null` (nothing to wait for on this host) |
| `replyText` | `assistantMessage?.content ?? ""` |
| `replySeq` | `0` — no ingest ever happened |
| `provider` / `model` | the session's, since that is what ran |
| `attempt` | `1` |
| `retryOfTurnId` | `null` |
| `error` | `turn.error?.reason ?? null` — see Traps, this loses structure |
| `userMessage` | `turn.userMessage` (non-null in the contract) |
| `assistantMessage` | `turn.assistantMessage` |

### 3. `GET /chat/sessions/:id` returns `activeTurn: null` on this host

T-M13-01 adds `activeTurn` to `ChatSessionDetail`. The local host has no turn
rows to report and answers synchronously, so there is never a turn in flight
between requests. `null` is the honest answer, not a placeholder.

## Checklist

- [ ] `asTurnState` in `packages/core/src/api/routes/chat.ts`, per decision 2
- [ ] `POST /chat/sessions/:id/messages` returns `ChatTurnState` for
      `free`/`project`/`agent`, and the existing `ChatTurn` for
      `agent-creator`
- [ ] `POST /chat/sessions/:id/retry` — same branch, same mapping
- [ ] `GET /chat/sessions/:id` returns `activeTurn: null`
- [ ] The `409` `postChatTurn` already throws for an incomplete previous turn
      is left exactly as it is — see Traps
- [ ] Unit tests for `asTurnState`: a succeeded turn, a failed turn, and that
      an agent-creator turn never reaches it
- [ ] `packages/core` typecheck and tests green — including
      `chat/service.test.ts`, which asserts `draftTurn` at lines 292 and 309
      and must not need editing

## Traps

**A local turn has no `chat_turns` row, so `ChatTurnState.id` has nothing
natural to hold.** Use the assistant message's id, falling back to the user
message's on a failed turn, and *say so in a comment* at the mapping site. The
field is required by the schema and T-M13-03 uses it as a React key and as
retry's target; a synthesized `crypto.randomUUID()` would change on every
refetch and silently break memoization and list reconciliation.

**`ChatTurnError` is structured; `ChatTurnState.error` is a plain string.**
`ChatTurnError` carries `kind`, `reason`, `attempts` and — importantly — a
`fallback` model suggestion that `TurnErrorBanner` renders as a
"retry on this instead" affordance. Flattening to `error: reason` **drops the
fallback offer on the local host**. That is a real, if small, capability loss,
and it is accepted here rather than hidden: the cloud path has no equivalent to
put in that field, and inventing one is M15's retry-affordance work, not this
task's. **If T-M13-03 finds the local secondary-model button visibly
disappearing, that is this decision surfacing — record it in
[`../../KnownGaps.md`](../../KnownGaps.md) rather than quietly widening the
contract.**

**Do not "fix" `postChatTurn`'s 409 to match `SPG16`.** The local guard is
`last.role === "user"` (service.ts:460) and the cloud guard is a partial unique
index — different mechanisms, same meaning, and both correct for their store.
Converging them would mean giving the local SQLite a turns table, which the
`chatTurns` schema comment explicitly declines ("No local SQLite mirror: local
chat is synchronous and single-machine, with no dispatch state to track").

**`subscribeChat` is already a documented no-op on this host.** Read
`WsHubLiveEventSource.subscribeChat`'s comment in
`packages/ui/src/lib/live-events.ts:55–67`. It returns an empty unsubscribe on
purpose because this route answers terminally. Nothing in this task should add
a `chat.*` member to `WsServerEvent` — a terminal response needs no stream.

## Verification

- [ ] `pnpm --filter @sparstrow/core test` green, `chat/service.test.ts`
      unedited
- [ ] Unit: `asTurnState` on a succeeded turn yields
      `status: "succeeded"` with `assistantMessage` populated; on a failed turn
      yields `status: "failed"`, `assistantMessage: null`, non-null `error`
- [ ] Against a running local daemon, `POST /chat/sessions/<free-session>/messages`
      returns a body `chatTurnStateSchema.parse` accepts
- [ ] The Agent Creator page still completes an interview end to end on the
      local host — its response shape is unchanged. Proved by clicking through
      `/agents/new`, not by reading the diff.

## On completion

- [ ] Tick 18.8 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] `KnownGaps.md` entry if the local fallback-model affordance was lost —
      see Traps

## Result

Shipped as designed. `asTurnState` + `respondWithTurn` in
`packages/core/src/api/routes/chat.ts`, both exported for direct unit testing
(the repo's existing pattern for pure mapping functions, e.g.
`chatTurnFailureFrom`). `POST /chat/sessions/:id/messages` and `.../retry`
now both call `respondWithTurn(await postChatTurn/retryChatTurn(...))`, and
`GET /chat/sessions/:id` returns `activeTurn: null`.

`respondWithTurn` branches on `turn.session.kind === "agent-creator"` and
returns the original `ChatTurn` object **by reference** for that branch — the
new `chat.test.ts` asserts `toBe(turn)`, not just deep-equality, specifically
to prove `asTurnState` is never reached for that session kind and the Agent
Creator's `draftTurn` field survives untouched.

**Verified:** `pnpm --filter @sparstrow/core test` (714 tests, all green,
including the 5 new ones and `agents/draft-service.test.ts` unedited) and
`pnpm --filter @sparstrow/core typecheck` (clean, after fixing one test fixture
that used a provider id — `"codex"` — not in `ProviderId`'s actual union).
`chat/service.test.ts` (the file that asserts `draftTurn` at the lines this
task's doc named) was not edited and still passes.

**Not run:** clicking through `/agents/new` against a live local daemon — that
needs a running daemon and browser, and belongs to
[T-M13-05](T-M13-05-verification.md). This task's own checklist item for it is
therefore carried into that verification pass rather than ticked here on
weaker evidence.

**Trap avoided, not just noted:** `ChatTurnError`'s `fallback` field really is
dropped by the flattening to `error: reason` — confirmed by writing the failed-turn
test, which shows `state.error` is a plain string with no way to carry
`fallback`. No `KnownGaps.md` entry opened yet: T-M13-03 is what will show
whether the local secondary-model retry button visibly regresses, per this
task's own On-completion note.
