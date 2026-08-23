# T-M12-02 — shared contracts and constants

| | |
|---|---|
| **Tag** | `[S]` — T-M12-03 and T-M12-04 both depend on these types existing first |
| **Serves** | foundational |
| **Depends on** | T-M12-01 (table shape, SQLSTATE codes, and the TTL value are inputs here) |
| **Blocks** | T-M12-03, T-M12-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Add the `chat.turn` command kind, its payload type, the enqueue/retry error
mapping, the wait-TTL and staleness constants, and the unified async
`ChatTurn` response contract — all in `packages/shared`, so both `apps/web`
and `packages/core` consume one definition each, per the shared-contracts
skill (no independent deploy, no version flag between them).

## Decisions already made

Cited from the plan, not restated: DD-7 (one async contract shape for both
topologies), DD-8 (pass-through + one byte clamp at the browser boundary,
strict whole-batch parse at the daemon boundary), DD-9 (staleness derived
from `last_event_at`, threshold exported once).

### `packages/shared/src/cloud.ts` additions

```ts
// CommandKind gains "chat.turn" — the union itself, not just the schema
// comment that has anticipated this slot since M1.
export type CommandKind = /* existing members */ | "chat.turn";

export interface ChatTurnStartPayload {
  turnId: string;
  sessionId: string;
  sessionKind: "free" | "project" | "agent";
  projectId: string | null;
  projectSlug: string | null; // ids AND slugs travel together, matching RunStartPayload — a
  agentId: string | null;     // cloud id resolves to nothing on a daemon's local SQLite (D-9)
  agentSlug: string | null;
  provider: string | null; // null = inherit session/agent default
  model: string | null;
  attempt: number;
}

export type ChatTurnWaitingReason = "no_runtime_paired" | "all_runtimes_offline" | "project_not_available";

// Mirrors ENQUEUE_ERRCODE_REASONS's existing shape exactly.
export const CHAT_TURN_ENQUEUE_ERRCODE_REASONS: Record<string, string> = {
  SPG16: "turn_in_progress",
  SPG17: "session_not_found",
  SPG18: "turn_not_found",
  SPG19: "turn_not_retryable",
};

// Set once at enqueue time (T-M12-01's `coalesce`), 24h — see that task's
// Result section for why this value was picked over the plan's original
// 10-minute proposal; flagged for owner confirmation, not silently closed.
export const CHAT_TURN_WAIT_TTL_MS = 24 * 60 * 60 * 1000;

// DD-9: a turn's daemon died mid-reply and posted nothing further. Exported
// once so the route (T-M12-03) and the UI (M13) apply the identical
// threshold — the SQL side of T-M12-01 must carry a comment naming this
// constant, per that task's Traps.
export const CHAT_TURN_STALE_MS = 60_000; // no ingest call in 60s while in_progress = stale
export function isChatTurnStale(turn: { status: string; updatedAt: string }): boolean {
  return turn.status === "in_progress" && Date.now() - new Date(turn.updatedAt).getTime() > CHAT_TURN_STALE_MS;
}
```

### `packages/shared/src/schemas/chat.ts` — the unified async contract (DD-7)

`ChatTurn` today is synchronous: `{ session, userMessage, assistantMessage, error }`,
because the local daemon answers in-process. The cloud path cannot return an
assistant message from the POST — the reply doesn't exist yet at that point.

**New shape, used by both hosts:**

```ts
export const chatTurnStateSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: z.enum(["waiting", "in_progress", "succeeded", "failed"]),
  waitingReason: z.enum(["no_runtime_paired", "all_runtimes_offline", "project_not_available"]).nullable(),
  replyText: z.string(),
  replySeq: z.number(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  attempt: z.number(),
  retryOfTurnId: z.string().nullable(),
  error: z.string().nullable(),
  userMessage: chatMessageSchema, // the row inserted at enqueue
  assistantMessage: chatMessageSchema.nullable(), // present only once status = "succeeded"
});
```

`POST /chat/sessions/:id/messages` and `.../retry` return this shape, in
whatever state the turn is in at response time (usually `waiting` or
`in_progress`, since the cloud POST returns immediately). The local Fastify
route (core, unchanged transport) returns the **same shape already in a
terminal state**, `assistantMessage` populated, because it still answers
in-process. `packages/ui`'s consumer renders the turn and subscribes only
while it's non-terminal — one code path, not a branch on which host it's
running in (`live-events.ts` already documents this as a question a
component must never ask; G-6 is the standing cost of getting it wrong).

`chatTurnRequestSchema` (the send-message body) and `chatRetryRequestSchema`
(the retry body, `{ provider?, model? }`) keep their existing fields — this
task only adds the response shape and the byte clamp below, not new request
fields.

**Validation posture, DD-8:**

- **Browser → `/api/v1`**: pass-through, house style, with one clamp — a
  byte ceiling on `content` in `chatTurnRequestSchema`. A chat message
  becomes an argv-bound prompt on someone's machine; unbounded input is a
  spawn failure on a laptop, not a 400 in a route. Reuse
  `TRANSCRIPT_BUDGET_BYTES`'s existing constant name/value as the ceiling
  reference point rather than inventing a second budget number — confirm its
  exact value in `packages/core/src/chat/service.ts` before hardcoding a
  copy here.
- **Daemon → `/api/daemon`**: strict, whole-batch-or-nothing parse for the
  events/result payloads, mirroring `parseEventBatch`'s existing shape
  exactly (T-M12-03 is the route that uses this schema; this task only
  defines it).

`OPAQUE_COLUMNS` needs no `chat_turns` entry per T-M12-01 (no jsonb column).

## Checklist

- [ ] `CommandKind` includes `"chat.turn"`
- [ ] `ChatTurnStartPayload` interface added
- [ ] `ChatTurnWaitingReason` type added
- [ ] `CHAT_TURN_ENQUEUE_ERRCODE_REASONS` map added, matching T-M12-01's SQLSTATEs exactly
- [ ] `CHAT_TURN_WAIT_TTL_MS` added at the value T-M12-01 used
- [ ] `CHAT_TURN_STALE_MS` + `isChatTurnStale()` added and exported
- [ ] `chatTurnStateSchema` added to `packages/shared/src/schemas/chat.ts`
- [ ] `chatTurnRequestSchema` gains the byte-ceiling clamp on `content`
- [ ] Daemon-boundary ingest payload schema(s) added (events batch, result), strict parse
- [ ] `packages/shared` typecheck and tests green

## Traps

**The SQLSTATE map must match T-M12-01's codes exactly** — a mismatch here
means the enqueue route (T-M12-03) reports the wrong reason to the browser
for a real conflict, which reads as correct until someone actually hits
`SPG18` and gets `turn_in_progress` instead.

**`CHAT_TURN_STALE_MS` is consumed in two languages.** T-M12-01's SQL side
must carry a comment naming this exact constant (already required by that
task's Traps) — if the two values drift, a turn can be "stale" in the UI
while the SQL still considers it live, or vice versa.

## Verification

- [ ] `pnpm --filter shared typecheck` green
- [ ] A unit test parsing a `content` value over the byte ceiling is rejected
      by `chatTurnRequestSchema`
- [ ] A unit test asserts `isChatTurnStale()` returns `false` for a
      `succeeded` turn regardless of `updatedAt` age (only `in_progress`
      turns go stale)

## On completion

- [ ] Tick 12.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

<!-- Filled in when the task lands. -->
