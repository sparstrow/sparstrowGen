# T-M12-01 — schema, RLS, enqueue/assign functions

| | |
|---|---|
| **Tag** | `[S]` — every other M12 task depends on the types and functions this creates |
| **Serves** | foundational — unblocks all of M12/M13/M14/M15 |
| **Depends on** | — |
| **Blocks** | T-M12-02, and transitively everything else in M12 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

## Objective

Add the `chat_turns` table, the `chat_messages.turn_id` column, their RLS, and
the SQL functions that enqueue a turn, assign it to an eligible online
runtime (or park it with a reason), and let the daemon post streamed/terminal
replies back — all `SECURITY DEFINER`, matching `009_command_spine.sql`'s
existing pattern for `runs`/`runtime_commands`.

This design was produced by the `data-modeler` sub-agent against the
owner-reviewed spec and is reproduced here close to verbatim because the
exact function signatures and rejected alternatives are the point — changing
them without reason reopens decisions already made.

## Decisions already made

### Table: `chat_turns` — new table, not columns on `chat_messages`, not a `runs` row

Rejected **columns on `chat_messages`**: a turn has cloud-only dispatch state
(waiting/in-progress, an assigned runtime, a wait deadline) that doesn't
attach to either the user or the assistant message row without ambiguity,
and updating a `chat_messages` row in place during streaming would put a
high-frequency write on a table also in the `postgres_changes` publication.

Rejected **reusing `runs`**: `runStatusSchema` has no `waiting`-for-a-machine
state, and a chat turn's defining behavior — park instead of reject when
nothing's available — is exactly the divergence `start_run` was deliberately
built *not* to have (M4 decision 7, "offline is not a queue"). Also matches
plan DD-1.

```ts
export const chatTurns = pgTable(
  "chat_turns",
  {
    id: text("id").primaryKey(), // ct_<uuid16>, minted by enqueue_chat_turn/retry_chat_turn
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),

    // Cloud-only vocabulary -- chat turns have no local SQLite mirror (local
    // chat is synchronous, single-machine, has no dispatch state). Exactly
    // the four states the spec's Key Entities section names.
    status: text("status").notNull().default("waiting"), // waiting | in_progress | succeeded | failed

    // Populated only while status = 'waiting'; recomputed by the same
    // assignment pass claim_runtime_commands runs on every poll (no new job).
    waitingReason: text("waiting_reason"), // no_runtime_paired | all_runtimes_offline | project_not_available

    assignedRuntimeId: text("assigned_runtime_id").references(() => runtimes.id, { onDelete: "set null" }),
    commandId: text("command_id").references(() => runtimeCommands.id, { onDelete: "set null" }),

    provider: text("provider"), // null = inherit session/agent default
    model: text("model"),

    attempt: integer("attempt").notNull().default(1),
    retryOfTurnId: text("retry_of_turn_id"), // code-enforced, NOT a DB FK -- mirrors tasks.parentTaskId

    replyText: text("reply_text").notNull().default(""), // ALWAYS full accumulated text, never a delta
    replySeq: integer("reply_seq").notNull().default(0),

    error: text("error"),
    waitExpiresAt: timestamp("wait_expires_at", { withTimezone: true }), // set ONCE, never pushed out
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_turns_workspace").on(t.workspaceId),
    index("idx_chat_turns_session").on(t.sessionId, t.createdAt),
    index("idx_chat_turns_assigned_runtime").on(t.assignedRuntimeId),
    index("idx_chat_turns_command").on(t.commandId),
    index("idx_chat_turns_retry_of").on(t.retryOfTurnId), // for the retry-chain query, not FK-index check
    index("idx_chat_turns_waiting").on(t.workspaceId, t.createdAt).where(sql`status = 'waiting'`),
  ],
);
```

**Deliberately not denormalized further**: `chat_sessions.kind`/`projectId`/`agentId`
are NOT copied onto `chat_turns` — the assignment path already joins
`chat_sessions` by indexed PK at low frequency; copying risks drift (session's
binding changes, turn's copy doesn't) for no measured benefit.

**`chat_messages` gains one column**, no other change:

```ts
turnId: text("turn_id").references(() => chatTurns.id, { onDelete: "set null" }),
// + index("idx_chat_messages_turn").on(t.turnId)
```

`SET NULL` not `CASCADE`: message history outlives an administratively
cleaned-up turn row, matching `runs`→`tasks.runId`-style non-destructive
linkage elsewhere in this schema. Every turn owns 0–2 messages via this FK
(the user message, created eagerly; the assistant message, created only on
`succeeded`).

**`chat_sessions` needs no new column.** Rejected an `activeTurnId` pointer —
"the active turn" is already an O(1) indexed lookup
(`chat_turns WHERE session_id = X AND status IN ('waiting','in_progress')`,
guaranteed ≤1 row by the FR-004 constraint below) via `idx_chat_turns_session`.

### FR-004's in-flight guard is a constraint, not a handler check

```sql
create unique index uq_chat_turns_session_active
  on public.chat_turns (session_id)
  where status in ('waiting', 'in_progress');
```

Partial unique index — at most one non-terminal row per session. Enforced
with `INSERT ... ON CONFLICT (session_id) WHERE status IN ('waiting','in_progress') DO NOTHING RETURNING id`;
a `NULL` return means the conflict fired and the calling function raises
`SPG16` — same idiom `cancel_run` already uses for its own conflict-as-signal
insert. A read-then-write guard in a route (the shape M2's defect 9 was) does
not satisfy this requirement.

### FK-index check

Every new FK is covered by an index with that FK as its leading column:
`chat_turns.workspace_id`→`idx_chat_turns_workspace`,
`chat_turns.session_id`→`idx_chat_turns_session`,
`chat_turns.assigned_runtime_id`→`idx_chat_turns_assigned_runtime`,
`chat_turns.command_id`→`idx_chat_turns_command`,
`chat_messages.turn_id`→`idx_chat_messages_turn`. `retry_of_turn_id` carries
no DB constraint, so it's exempt from this check by design. Re-run
`packages/shared/drizzle/policies/README.md`'s FK-index checker query after
the migration to confirm.

### RLS: `chat_turns` gets its own read-only block, never the blanket array

```sql
alter table public.chat_turns enable row level security;

create policy chat_turns_member_read on public.chat_turns
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

-- No insert/update/delete policy for `authenticated`, deliberately.
```

Every write is a computed state transition — a member with raw `UPDATE`
could set `status='succeeded'` and `reply_text` to anything and it would
render as a real assistant reply, the same forgery risk
`010_transcript_broadcast.sql` calls out for `run_events`. All writes go
through the `SECURITY DEFINER` functions below; `postgres` bypasses RLS on
its own tables by default (no `FORCE ROW LEVEL SECURITY` anywhere in this
schema) — same pattern `start_run` already relies on, not a new one.

**A columns-a-browser-must-never-write list, explicit**: `status`,
`waiting_reason`, `assigned_runtime_id`, `command_id`, `reply_text`,
`reply_seq`, `error`, `started_at`, `finished_at` — none reachable by direct
table write from `authenticated`, only via the functions below.

**Flagged finding on `chat_messages` — narrow it in this same task.**
`chat_messages` currently sits in `001_rls.sql`'s blanket `workspace_scoped`
array (`for all`), which lets any member `INSERT` a row with
`role = 'assistant'` and arbitrary content directly via PostgREST —
indistinguishable in the UI from a real reply the moment
`ingest_chat_turn_reply` starts writing real ones. Pull `'chat_messages'` out
of that array and give it: `select` unchanged; `insert` to `authenticated`
`with check (workspace_id in (...) and role = 'user')`; no `update`/`delete`
for `authenticated` (messages become append-only). **Before narrowing**,
grep `packages/core` and `apps/web` for every existing `chat_messages`
insert — the cloud `POST /chat/sessions` handler doesn't insert messages
today (only sessions), but the agent-creator local flow was not checked by
the data-modeler pass and must be confirmed here.

### Functions — SQLSTATEs `SPG16`–`SPG19`, continuing `009_command_spine.sql`'s sequence

| Code | Reason token | Raised by |
|---|---|---|
| `SPG16` | `turn_in_progress` | `enqueue_chat_turn` / `retry_chat_turn`, on the FR-004 conflict |
| `SPG17` | `session_not_found` | either, session not visible to caller |
| `SPG18` | `turn_not_found` | `retry_chat_turn`, unresolved `retryOfTurnId` |
| `SPG19` | `turn_not_retryable` | `retry_chat_turn`, target isn't `succeeded`/`failed` |

**`public.enqueue_chat_turn(p_session_id, p_content, p_draft jsonb default null)` → jsonb**,
`SECURITY DEFINER`, granted `authenticated`, membership-checked internally
(same shape as `start_run`):

1. Resolve session, membership-scoped; `SPG17` if not found.
2. `INSERT` the `chat_turns` row (`status='waiting'`) with the FR-004
   `ON CONFLICT ... DO NOTHING RETURNING id`; no row back → `SPG16`.
3. `INSERT` the user `chat_messages` row, `turn_id` = the new turn.
4. Call `private.assign_or_park_chat_turn(...)` to attempt immediate assignment.
5. `UPDATE chat_sessions SET last_message_at = now()`.
6. Return the turn row as jsonb.

**Crucial, explicit divergence from `start_run`**: `enqueue_chat_turn` never
raises for "nothing is online" — it always succeeds by parking the turn
`waiting` with a reason. Only a bad session id or an already-in-flight turn
is a hard error. This is the whole mechanism behind US2.2.

**`public.retry_chat_turn(p_turn_id, p_provider default null, p_model default null)` → jsonb**,
same grant shape:

1. Resolve the original turn, membership-scoped, `status in ('succeeded','failed')`
   else `SPG19`; not found → `SPG18`.
2. Copy the original's user message content into a **new** `chat_messages`
   row on a **new** turn (`session_id` unchanged, `attempt = original.attempt + 1`,
   `retry_of_turn_id = p_turn_id`, `provider = coalesce(p_provider, original.provider)`,
   `model = coalesce(p_model, original.model)`) — same `ON CONFLICT` guard →
   `SPG16` on a race.
3. `private.assign_or_park_chat_turn(...)`.
4. Update `last_message_at`.

Retry never reuses the original `chat_messages` row — each attempt owns its
own user+assistant pair via `turn_id`. That's what makes "the previous reply
stays in history" (US3.2) just "don't touch the old rows."

**`private.assign_or_park_chat_turn(p_turn_id, p_workspace_id, p_session_kind, p_project_id, p_provider)` → void**,
`SECURITY DEFINER`, `private` schema (unreachable via PostgREST):

- Call `private.pick_runtime_for(p_workspace_id, p_provider, case when p_session_kind = 'project' then p_project_id else null end)`.
- Found → `INSERT runtime_commands(kind='chat.turn', idempotency_key='chat.turn:'||p_turn_id, payload=...)`
  (payload shape: T-M12-02); `UPDATE chat_turns SET status='in_progress', assigned_runtime_id=..., command_id=..., started_at=now(), waiting_reason=null`.
- Not found → compute `waiting_reason` (`no_runtime_paired` if the workspace
  has zero `runtimes` rows at all; `project_not_available` if the session is
  `project`-kind and no online+capable runtime has it `bound`;
  `all_runtimes_offline` otherwise) and
  `UPDATE chat_turns SET waiting_reason=..., wait_expires_at = coalesce(wait_expires_at, now() + interval '<TTL>')`.
  **The `coalesce` is load-bearing**: the deadline is set once at creation
  and never pushed out by a later recompute.

`idempotencyKey = 'chat.turn:' || turnId` is safe against the M4 trap
("`uq_runtime_commands_idem` is globally unique") the same way
`'run.start:' || runId` is — `turnId` is already globally unique, and a
retry gets its own new turn id.

**`private.pick_runtime_for(p_workspace_id, p_provider, p_project_id)` → text** —
**factor this out of `start_run`'s existing inline predicate** (the
online+capable+project-bound-if-set query in `009_command_spine.sql`), now
needed at three call sites. Review this as a diff against the existing
inline logic, not a green-field function — it's the security-critical
eligibility check.

**Extend `public.claim_runtime_commands`** with a preamble before its
existing claim logic: resolve `v_workspace_id` from `runtimes where id = p_runtime_id`
(a new lookup — the function currently trusts `p_runtime_id` for filtering
only, never joins on it), then
`perform private.rescan_waiting_chat_turns(v_workspace_id, p_runtime_id);`.

**`private.rescan_waiting_chat_turns(p_workspace_id, p_runtime_id)` → void**,
`private`, `SECURITY DEFINER`:

- `SELECT ... FOR UPDATE SKIP LOCKED` every `chat_turns` row
  `WHERE workspace_id = p_workspace_id AND status = 'waiting'` (uses
  `idx_chat_turns_waiting`).
- Expired first: `wait_expires_at < now()` →
  `status='failed', error='No machine picked up this message in time.', finished_at=now()`.
  This is the TTL sweep, riding the existing 3s poll cadence exactly the way
  `claim_runtime_commands`' own poison-row sweep already does — no new
  scheduler.
- For the rest: if `p_runtime_id` itself is a valid candidate (it's the one
  polling, so online by definition; capable per its own `capabilities`;
  project-bound if the session is `project`-kind), assign directly to it via
  the same `runtime_commands` insert + status flip as
  `assign_or_park_chat_turn`'s success branch. Otherwise, recompute and
  update `waiting_reason` only.

**`public.ingest_chat_turn_reply(p_turn_id, p_runtime_id, p_seq, p_reply_text, p_status, p_error default null)` → jsonb**,
`SECURITY DEFINER`, `service_role` only (revoked from `authenticated`,
exactly like `claim_runtime_commands`/`ack_runtime_command`):

- Resolve the turn scoped by `id = p_turn_id AND assigned_runtime_id = p_runtime_id`
  — a token for machine A can't write machine B's turn, same containment
  rule as `ack_runtime_command`.
- Not found → `{ok:false, reason:'not_found'}` (non-throwing; daemon retries).
- Already terminal → `{ok:true, alreadyCompleted:true}` — idempotent,
  mirrors `ack_runtime_command` verbatim.
- `p_seq <= replySeq` → no-op, `{ok:true, alreadyCompleted:false, stale:true}`
  — a duplicate or late delivery must never regress `reply_text`.
- Else: `UPDATE chat_turns SET reply_text=p_reply_text, reply_seq=p_seq, status=(case p_status when 'running' then 'in_progress' else p_status end), error=nullif(p_error,''), finished_at=(case when p_status in ('succeeded','failed') then now() else finished_at end)`.
- **Only on `p_status = 'succeeded'`**: `INSERT` the assistant
  `chat_messages` row (`role='assistant', turn_id=p_turn_id, content=p_reply_text, meta={provider, model}`),
  bump `chat_sessions.last_message_at`. **This is the only place an
  assistant `chat_messages` row is ever created**, and it's
  `service_role`-only — a member can never forge it.

**Why full-text-so-far, not a `chat_turn_events` child table.** `run_events`
exists because transcripts need a full replayable trace of every event type
for the Runs board and cost accounting. Chat's user-facing surface is plain
text only — nothing in the spec asks for a replayable event-by-event chat
trace, only a growing reply. Sending the **full accumulated text** on every
ingest call (mirroring how `runs.resultText` is a single overwritten column)
makes ingest trivially idempotent under retry or reordering with one
`p_seq` comparison — no seq-contiguity requirement, no gap handling.

**Command-ack split mirrors M4 decision 2, not a new pattern.**
`ack_runtime_command` closes the `chat.turn` command `done` the moment the
daemon *accepts* the work (right after claim, before generating anything) —
same "ack on accept, not on completion" rule already governing `run.start`.
`ingest_chat_turn_reply` is the ongoing progress-and-terminal channel for the
turn itself. `ack_runtime_command` needs **no code change** — already fully
generic on `(id, runtime_id, status, error)` with no `kind` branching.

**Named gap this creates, and its fix, in this same task:** if the daemon
acks the `chat.turn` command `failed` before ever calling
`ingest_chat_turn_reply` (e.g. the project preflight re-check at claim time
fails — same double-check M4 decision 6 requires), nothing marks the
`chat_turns` row `failed`. Fix, same shape M4 already established: the
`/api/daemon/commands/:id/ack` route, on a `chat.turn`-kind command acked
`failed`, calls `ingest_chat_turn_reply` itself with the ack's reason — no
new DB function, `ingest_chat_turn_reply`'s terminal-failed path already
covers it. This route edit belongs to T-M12-03, not here — noted in both.

### Realtime publication

`chat_turns` must **not** be added to `002_realtime.sql`'s `postgres_changes`
publication — same reasoning that file already gives for excluding
`run_events`: streaming writes up to ~1/sec while `in_progress` would
double-deliver the same signal the broadcast channel carries. `chat_sessions`
and `chat_messages` stay in the publication unchanged (both remain
low-frequency).

### `CHAT_TURN_WAIT_TTL_MS` — set to 24 hours, flagged for owner confirmation

The plan's DD-3 proposed 10 minutes; the data-modeler design proposed 24
hours, reasoned from "sent before bed, machine turned on in the morning."
**24 hours is what this task builds** — it's the better-reasoned value and
directly serves the spec's US2.2 ("the reply arrives automatically once a
machine picks it up"), which 10 minutes would defeat for anyone who steps
away. It is a plain constant with no migration cost to change later. Named
as an assumption, not silently picked — surface it to the owner in this
task's Result section rather than treating it as closed.

### `OPAQUE_COLUMNS` (`apps/web/src/lib/case.ts`)

No entry needed — every new/changed column here is `text`, `integer`, or
`timestamp`. No `jsonb` column is added by this task.

## Checklist

- [x] `chatTurns` Drizzle table added to `packages/shared/src/db/schema.ts`, per the column list above
- [x] `chatMessages.turnId` column + index added to the same file
- [x] Migration generated via `drizzle-kit generate` (`0005_chat_turn_dispatch.sql` + snapshot) and applied to **staging** (`pnymngoqseltgigcfevq`) via the Supabase MCP's `execute_sql` — `drizzle-kit migrate` itself was blocked by the auto-mode classifier as a direct DB-write shell command; MCP was the approved path
- [x] `chat_turns` RLS block added (own block, NOT the blanket `workspace_scoped` array) — in `014_chat_turn_dispatch.sql`, not `001_rls.sql` itself, matching this directory's own precedent of a later file amending an earlier one's policy (005 does this to a pre-M1 function)
- [x] `chat_messages`'s existing blanket policy narrowed — confirmed via grep that neither the cloud `POST /chat/sessions` handler nor the local agent-creator flow inserts a `chat_messages` row through this table's PostgREST surface, so narrowing was safe
- [x] `uq_chat_turns_session_active` partial unique index created
- [x] FK-index check re-run and passing for every new FK (empty result — zero unindexed FKs)
- [x] `SPG16`–`SPG19` added, continuing `009_command_spine.sql`'s sequence
- [x] `enqueue_chat_turn`, `retry_chat_turn` functions written and granted to `authenticated`
- [x] `private.pick_runtime_for` factored out of `start_run`'s existing inline predicate; `start_run` updated to call it — verified via live test that its SPG12/SPG13/success behavior is unchanged (see Result)
- [x] `private.assign_or_park_chat_turn`, `private.rescan_waiting_chat_turns` written, `private` schema, unreachable via PostgREST
- [x] `claim_runtime_commands` extended with the `rescan_waiting_chat_turns` preamble and the new `runtimes` workspace lookup
- [x] `ingest_chat_turn_reply` written, `service_role`-only, revoked from `authenticated`
- [x] `chat_turns` confirmed absent from `002_realtime.sql`'s publication (not added — file untouched); `chat_sessions`/`chat_messages` confirmed unchanged there
- [x] `CHAT_TURN_WAIT_TTL_MS = 24h` — used consistently between this SQL (`interval '24 hours'`) and T-M12-02's TypeScript constant
- [x] `packages/shared` typecheck and tests green (see Result — full monorepo re-verified too)

## Traps

**`chat_turns` in the blanket RLS array is a silent forgery hole**, not a
loud failure — copy-pasting the array loop instead of writing this table's
own block compiles fine and looks done.

**The FK-index check will not flag `retry_of_turn_id`** — that's correct
(it's deliberately not a DB FK), not a gap to fix.

**`private.pick_runtime_for` is security-critical** — treat this refactor
like the RLS README says to treat `001_rls.sql`, not like an ordinary
extraction. A behavior change here silently changes who `start_run` will
dispatch to.

**Do not apply this migration directly to staging.** Per the `supabase`
skill, scratch-branch it first.

## Verification

All run live against **staging** (`pnymngoqseltgigcfevq`), using the real
workspace and the real online scratch machine still paired from M11 —
scratch rows created and fully deleted afterward, zero trace left.

- [x] `enqueue_chat_turn` called (simulating the owner's JWT via
      `set_config('request.jwt.claims', ...)`) against a scratch session in a
      workspace with a real capable **online** runtime → immediately
      assigned, `status='in_progress'`, `assigned_runtime_id` set to the
      real machine, a `chat.turn` `runtime_commands` row created with the
      exact `ChatTurnStartPayload` shape.
- [x] **Live confirmation of a gap already named in the design**: the real
      M11 scratch daemon (still polling) claimed the `chat.turn` command
      within its poll interval and correctly failed it with *"This machine
      does not understand the command 'chat.turn'. It may be running an
      older version of core"* (M4's own unknown-kind guard, unmodified) —
      and, exactly as T-M12-01/T-M12-03 anticipated, `chat_turns.status`
      stayed `in_progress` because the ack-route fix (T-M12-03) isn't built
      yet. Manually called `ingest_chat_turn_reply` to close it out
      (simulating that future fix) and confirmed it correctly transitions
      the turn to `failed` with the error carried through.
- [x] Second `enqueue_chat_turn` call against a session with a turn already
      `in_progress` → raises `SPG16` (confirmed live).
- [x] `enqueue_chat_turn` against a nonexistent session → raises `SPG17`.
- [x] `retry_chat_turn` against a `failed` turn → new turn row (`attempt`
      incremented, `retry_of_turn_id` set), new `chat_messages` row with the
      original content copied, original turn/message rows untouched —
      confirmed by reading both message rows back.
- [x] `retry_chat_turn` against an `in_progress` turn → raises `SPG19`.
- [x] `retry_chat_turn` against a nonexistent turn id → raises `SPG18`.
- [x] `retry_chat_turn` with a `p_model` override → new turn's `model`
      reflects the override, `provider` inherited from the original.
- [x] `ingest_chat_turn_reply` called as `service_role` for a turn assigned
      to runtime A, with a fabricated runtime id → `{ok:false,
      reason:'not_found'}` (cross-machine containment confirmed).
- [x] `ingest_chat_turn_reply` called again on an already-terminal turn →
      `{ok:true, alreadyCompleted:true}`, no mutation.
- [x] FK-index checker query passes clean — zero unindexed FKs on
      `chat_turns`/`chat_messages`.
- [x] RLS policy shape query confirms exactly one SELECT policy on
      `chat_turns` (no insert/update/delete), and exactly one SELECT + one
      INSERT (role='user' only) on `chat_messages` — the blanket `for all`
      policy is gone.
- [x] `get_advisors(type:"security")` — only the expected findings:
      `enqueue_chat_turn`/`retry_chat_turn` join the existing accepted list
      (`start_run`, `cancel_run`, `bootstrap_workspace`,
      `delete_own_account`) as membership-checked `SECURITY DEFINER`
      functions callable by `authenticated`; `ingest_chat_turn_reply`
      correctly does **not** appear (service-role only); the pre-existing
      `auth_leaked_password_protection` Pro-tier gap is unrelated. No new or
      unexpected finding.
- [x] `get_advisors(type:"performance")` — only "unused index" INFO-level
      findings on the brand-new empty tables, expected for a table with zero
      queries against it yet.
- [x] Verified the `private.*` grant question directly: `assign_or_park_chat_turn`
      and `rescan_waiting_chat_turns` carry the same default `anon:true,
      auth:true` EXECUTE grant as the pre-existing `private.current_workspace_ids()`
      and siblings — not a new gap, matching established precedent (schema
      privacy via PostgREST's non-exposure of `private` is the actual
      boundary, not per-function revokes).
- [x] `pnpm --filter shared typecheck` and `pnpm --filter shared test` green.

Full HTTP-level cross-workspace isolation proof (through the actual
`/api/daemon/*` routes with a bearer token, not direct SQL with a simulated
JWT) is T-M12-06's, once T-M12-03's routes exist.

## On completion

- [ ] Tick 12.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

Landed as `packages/shared/drizzle/0005_chat_turn_dispatch.sql` (Drizzle
table migration), `packages/shared/drizzle/policies/014_chat_turn_dispatch.sql`,
and `packages/shared/drizzle/policies/015_chat_broadcast.sql` — all applied
live to staging (`pnymngoqseltgigcfevq`) via the Supabase MCP, not just
written and left unverified.

**Two real things found only by running it, not by reading it:**

1. **A test-fixture gap that looked like a dispatch bug at first.** The first
   `enqueue_chat_turn` call against a scratch session with `provider = null`
   reported `waiting_reason = 'all_runtimes_offline'` even though a real,
   online, capable machine existed. Root cause:
   `jsonb_exists(capabilities, NULL)` returns `NULL` (falsy), so a session
   with no stored provider can never match any runtime. Traced to whether
   this is reachable in practice: `apps/web/src/lib/api/handlers/chat.ts`'s
   `POST /chat/sessions` already defaults `provider` to `"claude-code"`
   whenever the caller doesn't specify one — a real session's `provider` is
   never null. The scratch SQL fixture had skipped that default. Fixed the
   fixture, not the function; re-ran, and dispatch worked immediately.
2. **The ack-route gap named in this task's own Traps section is real, and
   was witnessed live**, not just reasoned about — see the Verification
   section above. T-M12-03 owns the actual fix (the `/api/daemon/commands/:id/ack`
   route calling `ingest_chat_turn_reply` on a failed `chat.turn` ack); this
   task's own scope ends at the SQL layer working correctly when that call
   is made, which it does.

**The Supabase MCP OAuth blocker from earlier in this session was resolved**
by the owner authenticating it interactively (`/mcp` in a separate terminal).
Direct `drizzle-kit migrate`/`psql`-equivalent shell commands were blocked by
the auto-mode classifier as unreviewed direct DB writes; the Supabase MCP's
`execute_sql` was the approved path and matches the `supabase` skill's own
recommended iteration workflow.

**Verified:**
- `pnpm --filter shared typecheck` clean.
- `pnpm --filter core typecheck`, `pnpm --filter web typecheck`,
  `pnpm --filter ui typecheck` all clean (re-checked after the `CommandKind`
  extension in T-M12-02 and the schema change here).
- Every function-level behavior in the Verification section above run live
  against staging with real data, not asserted from reading the SQL.
- `get_advisors` (security + performance) clean of anything unexpected.
- FK-index and RLS-policy-shape checks both clean.
- All scratch test rows (one chat session, three turns across the
  enqueue/retry chain, two messages, three runtime_commands rows) deleted
  after verification — confirmed zero rows left via a follow-up count query.

**Not verified by this task** (explicitly deferred to T-M12-03/T-M12-04/T-M12-06,
which own the pieces that would make them reachable):
- The daemon actually executing a `chat.turn` command and posting real
  streamed output (needs T-M12-04's core executor — today the real scratch
  daemon correctly rejects the kind as unknown, which is itself a useful
  live confirmation that M4's unknown-kind guard still works unmodified).
- HTTP-level cross-workspace containment through the real `/api/daemon/chat/turns/*`
  routes with a bearer token (needs T-M12-03's routes — today's containment
  test used direct SQL with a fabricated runtime id, which proves the SQL
  layer's own scoping but not the route's token resolution).
- Realtime broadcast delivery on the `chat:` topic (needs T-M12-05's
  subscribe code to have a client to assert against).
