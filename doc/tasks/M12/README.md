# M12 — chat turn dispatch spine

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M12) |
| **Kind** | **foundational** — blocks M13/M14/M15, demos to nobody |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | nothing new — M4 (command spine) and M5 (ingest + broadcast) are code-complete |
| **Blocks** | M13, M14, M15 |
| **Status** | not started |
| **Open questions** | none |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M12-01 — schema, RLS, enqueue/assign functions](T-M12-01-schema-and-dispatch-functions.md) | `[S]` | foundational | — | ✅ done 2026-08-23, verified live on staging |
| [T-M12-02 — shared contracts and constants](T-M12-02-shared-contracts.md) | `[S]` | foundational | 12.1 | ✅ done 2026-08-23 |
| [T-M12-03 — daemon-facing routes + broadcast policy](T-M12-03-daemon-routes-and-broadcast.md) | `[P]` | foundational | 12.2 | ✅ done 2026-08-23, SQL contract verified live on staging (HTTP-level pass deferred to T-M12-06) |
| [T-M12-04 — core command-loop case + turn executor](T-M12-04-core-chat-turn-executor.md) | `[P]` | foundational | 12.2 | ✅ done 2026-08-23, dispatch chain verified live on staging (real HTTP pass deferred to T-M12-06, tracked as G-30) |
| [T-M12-05 — `LiveEventSource.subscribeChat`](T-M12-05-live-event-source-chat.md) | `[S]` | foundational | 12.3 | ✅ done 2026-08-23 |
| [T-M12-06 — verification](T-M12-06-verification.md) | `[S]` | foundational | 12.1–12.5 | not started |

12.3 and 12.4 are `[P]` against each other: 12.3 touches `apps/web/*` and a
new SQL policy file, 12.4 touches `packages/core/*` — zero file overlap, both
depend only on 12.2's shared types landing first.

## Objective

Give a chat turn a durable cloud row, dispatch it through the exact command
spine M4 already built (claim/lease/ack, 3s poll), execute it on the daemon
using the chat logic that already exists locally, and stream its output back
to the browser through the exact ingest-then-broadcast shape M5 already
proved for run transcripts. Nothing here is visible to the owner — M13
renders it.

## The shape of what was found

Reading the code ahead of decomposition confirmed the plan's DD-1 through
DD-10 are buildable as designed, with three things worth naming before anyone
starts:

- **`runtime_commands.kind` already has room for this.** Its schema comment
  has named `chat.turn` as a future kind since M1 — this is not a new column,
  just the first thing to actually use that slot.
- **`claim_runtime_commands` is one SQL function, called from one place**
  (`packages/core/src/cloud/commands.ts`'s 3s poll). DD-4's "the poll adopts
  waiting turns" means editing that one function to also assign eligible
  `chat_turns` rows before or alongside claiming existing commands — not
  adding a second poller.
- **`completeOnce` has zero existing callers passing a third argument.** Its
  only caller today is the Agent Creator's local flow. Adding an optional
  `onEvent` callback is additive and needs no change at that call site — worth
  confirming with a grep at task 12.4's start so this isn't taken on faith.

## Definition of done

- A `chat.turn` command inserted by hand (SQL or a scratch script) is claimed
  by a running daemon within one poll interval.
- That daemon executes it via `packages/core/src/cloud/chat-turn.ts`, using
  the *existing* `buildTranscriptPrompt` / provider-spawn logic — not a
  reimplementation.
- Streamed deltas land durably in `chat_turns` (idempotent under a replayed
  batch — same key discipline as `run_events`) and arrive on the
  `chat:<workspaceId>:<sessionId>` Realtime topic.
- The turn finishes with a `chat_messages` assistant row inserted the same
  way the existing local path inserts one.
- Cross-workspace isolation is proved through HTTP for both new
  `/api/daemon/chat/turns/:id/*` routes — the service role bypasses RLS, and
  M4 shipped exactly this defect once, caught only live.
- `pnpm typecheck` and `pnpm test` stay green across `packages/shared`,
  `packages/core`, and `apps/web`.

**Not in this phase:** nothing the owner can open. `POST /chat/sessions/:id/messages`
stays a stub until M13 retires it — this phase proves the pipe works with
a hand-inserted row, not a real send button.

---

## Decisions already made

Cited from the plan, not restated: DD-1 (a `chat.turn` command, not a run),
DD-2 (dedicated `chat_turns` table), DD-3 (waits bounded by a TTL, does not
refuse), DD-4 (the existing poll adopts waiting turns, no new scheduler),
DD-5 (streaming granularity is whatever the provider emits, stated not
assumed — the probe itself is 12.4's, the *statement* of what it found is
M13's since it's user-facing), DD-6 (daemon resolves agent/project from
`cloud_links`/`runtime_projects`, builds the prompt locally), DD-8 (strict
whole-batch parse at the daemon boundary), DD-9 (staleness derived from
`last_event_at`, no sweeper), DD-10 (chat gets its own broadcast topic and
policy, select-only, not on `postgres_changes`).

### 1. Waiting-turn assignment lives in the same SQL function as claiming, not a new one

`claim_runtime_commands` already runs once per runtime per poll and already
knows that runtime's id, capabilities, and bound projects (it has to, to
decide what it may claim). Extending it to also promote eligible
`chat_turns` rows to `runtime_commands` rows for *this* runtime — inside the
same transaction — means a turn can go from `waiting` to `assigned` and get
claimed in the same round-trip, which matters for DD-3's TTL: a second SQL
function polling on its own schedule is a second place "eligible" can drift
from `start_run`'s definition, which DD-4 explicitly rejected.

### 2. The eligibility predicate is extracted once, in SQL, and called from both `start_run` and the new assignment step

DD-4 requires this ("extracted once and called from both, not copied"). It
lives as a SQL function (`runtime_can_serve(runtime_id, project_id)` or
equivalent — exact name and signature is 12.1's to fix, since it owns the
migration) rather than being duplicated as near-identical `WHERE` clauses in
two places. `start_run`'s existing predicate is the one being extracted, not
rewritten — read it before writing the new function.

### 3. Command payload carries slugs *and* ids, matching `RunStartPayload`

DD-6 already states this; naming it here so 12.2 doesn't have to re-derive
the reasoning: a cloud id resolves to nothing on a daemon's local SQLite
(different id space, per [D-9](../../Deferred.md)), so the payload needs the
slug for local lookup and the cloud id for reporting back which agent/project
was actually used.

---

## Files

| Path | Change |
|---|---|
| `packages/shared/drizzle/*` (new migration) | `chat_turns` table — delegated to `data-modeler`, task 12.1 |
| `packages/shared/drizzle/policies/014_chat_turn_dispatch.sql` | new — RLS for `chat_turns`, task 12.1 |
| `packages/shared/drizzle/policies/015_chat_broadcast.sql` | new — `realtime.messages` select-only policy for `chat:` topics, task 12.3 |
| `packages/shared/drizzle/policies/016_chat_turn_transcript.sql` | new — `assign_or_park_chat_turn` embeds a windowed message-history array in the dispatched command payload, task 12.4 (discovered mid-task: `ChatTurnStartPayload` had no transcript field to give the daemon) |
| `packages/shared/src/db/schema.ts` | edit — `chatTurns` Drizzle table, task 12.1 |
| `packages/shared/src/cloud.ts` | edit — `chat.turn` command kind/payload types, wait-TTL constant, staleness-threshold constant and its derivation function, task 12.2 |
| `packages/shared/src/schemas/chat.ts` | edit — ingest/result payload schemas for the daemon boundary, task 12.2 |
| `apps/web/src/app/api/daemon/chat/turns/[id]/events/route.ts` | new — durable write + broadcast, task 12.3 |
| `apps/web/src/app/api/daemon/chat/turns/[id]/result/route.ts` | new — terminal write + broadcast + `chat_messages` insert, task 12.3 |
| `apps/web/src/lib/daemon/broadcast.ts` | edit — reuse `planBroadcast`'s chunking for the chat topic, task 12.3 |
| `apps/web/src/lib/case.ts` | edit — `OPAQUE_COLUMNS.chat_turns` entry if the data model lands a jsonb column, task 12.1/12.3 |
| `packages/core/src/cloud/commands.ts` | edit — `chat.turn` case in the claim/execute loop, task 12.4 |
| `packages/core/src/cloud/chat-turn.ts` | new — resolves agent/project via `cloud_links`/`runtime_projects`, calls the existing chat-turn logic with an `onEvent` hook, posts to the daemon routes, task 12.4 |
| `packages/core/src/chat/service.ts` | edit — `completeOnce` gains an optional `onEvent` callback, additive, task 12.4 |
| `packages/ui/src/lib/live-events.ts` | edit — `subscribeChat`, mirroring the existing run-transcript subscribe, task 12.5 |

## Traps

**The service role bypasses RLS on both new daemon routes.** M4 shipped a
cross-workspace defect here once, caught only by a live HTTP test, not by
unit tests against a fake client. Task 12.3 and 12.6 both carry an explicit
"POST as daemon A, targeting daemon B's turn id, assert 403/404" case — do
not consider this covered by the RLS policy existing.

**`chat_turns.session_id` needs a partial unique index for FR-004, not a
handler check.** A read-then-write guard in a route is exactly the shape
M2's defect 9 was — two simultaneous sends, or two open tabs, both read "no
turn in flight" before either writes. The constraint is 12.1's job; 12.3's
route relies on the insert failing, it does not re-check first.

**The staleness threshold exists in two places and they must move together.**
DD-9 requires it in TypeScript (for the UI/route to read) and in SQL (so a
stale turn cannot block `FR-004`'s next-send guard). Task 12.1's migration
comment must name the shared constant so a future change to one is not made
without the other — this is the exact class of drift `isRuntimeOnline`
already had to be careful about (M3 decision 4).

**`completeOnce`'s existing caller must not silently change behavior.** The
Agent Creator calls it today with two arguments. Adding an optional third
(`onEvent`) is additive by construction, but task 12.4 confirms this with a
grep and a passing test for that existing call site before considering the
change safe — "additive" is a claim to verify, not assume.

**A `chat.turn` command with an agent/project miss must ack the same way
`start_run` does.** DD-6 requires `agent_not_available` / `project_not_available`
on a miss, reusing M4 decision 6's re-verification-against-the-filesystem
rule. Do not invent a new ack shape for chat; the UI (M14) is written to
expect the existing one.

## Verification

Full procedure in [T-M12-06 — verification](T-M12-06-verification.md).

1. A hand-inserted `chat_turns` row (status `waiting`, no `runtime_id`) is
   picked up by a running daemon's next poll once eligible, without any UI.
2. That daemon runs the existing chat logic against payload-supplied history
   (not local SQLite) and posts events + a result back.
3. Events land idempotently and arrive on the Realtime topic; a replayed
   batch is a no-op.
4. Cross-workspace isolation holds through real HTTP requests against both
   new routes, not just unit tests.
5. `pnpm typecheck` and `pnpm test` are green for every touched package.
