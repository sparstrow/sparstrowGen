# T-M14-01 — three waiting-reason cards, and TTL-expiry told apart from a real failure

| | |
|---|---|
| **Tag** | `[S]` — edits `chat.tsx`, the same file T-M13-03 rewrote and the concurrent `chat-context-menu-design-0eb2ff` worktree (unmerged) is also editing (~205 lines, a context-menu feature). Check `development` before starting; this task's edits are additive to the turn-rendering block T-M13-03 shipped, not a rewrite of it. |
| **Serves** | US2 — scenarios 1, 2, 3 |
| **Depends on** | M13 (done) — `ChatTurnState.waitingReason` and the generic `WaitingNotice` this task replaces |
| **Blocks** | T-M14-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟢 done 2026-08-23 |

## The scenarios this satisfies

> **US2 — Told plainly when nothing can answer** ([spec](../../specs/2026-08-23-chat-message-sending.md))
>
> 1. **Given** no machine has ever been paired, **When** the owner sends a
>    message, **Then** they see "this needs a paired machine to reply" with a
>    direct link to pairing.
> 2. **Given** a paired machine is currently offline, **When** the owner sends
>    a message in a Free or Agent session, **Then** they see "waiting for a
>    machine to come online" — the message is not lost, and the reply arrives
>    automatically once a machine picks it up (bounded by
>    `CHAT_TURN_WAIT_TTL_MS`, 24h).
> 3. **Given** a Project-context session where no paired machine has that
>    project checked out locally, **When** the owner sends a message,
>    **Then** they're told this project isn't available on any online
>    machine, the same words `start_run` already produces.

## Objective

Replace `chat.tsx`'s single generic `WaitingNotice` with three distinct,
actionable cards keyed off `turn.waitingReason`, and give a TTL-expired turn
its own "took too long" treatment instead of reading as a generic provider
failure.

## Decisions already made

**1. The three reasons need no new backend work — the data is already on the
wire, unused.** `chatTurnWaitingReasonSchema` (`packages/shared/src/schemas/chat.ts`)
already has the exact three values (`no_runtime_paired`, `all_runtimes_offline`,
`project_not_available`), computed by `private.assign_or_park_chat_turn`
(`packages/shared/drizzle/policies/014_chat_turn_dispatch.sql:344-369`) and
passed straight through by `turnStateRow()`'s unconditional `...turnRow`
spread (`apps/web/src/lib/api/handlers/chat.ts:63-67`). This task is a
rendering change only — no migration, no route change, no shared-schema edit.

**2. `project_not_available`'s exact wording**, per the plan's instruction to
reuse `start_run`'s words: `"No online machine has this project on disk."`
(`start_run`'s SPG13 message, `packages/shared/drizzle/policies/009_command_spine.sql:202`).
Use this text verbatim rather than paraphrasing — the plan's whole point is
one wording the owner learns once, not two near-identical phrasings for the
same fact depending on which feature they hit it from.

**3. How a TTL-expired turn is told apart from a genuine provider failure,
with no new status value.** `rescan_waiting_chat_turns`'s TTL sweep
(`014_chat_turn_dispatch.sql:401-409`) sets `status = 'failed'`, `error =
'No machine picked up this message in time.'` — there is no `'expired'`
status; `chatTurnStatusSchema` stays `waiting | in_progress | succeeded |
failed`, unchanged. The sweep does **not** clear `waiting_reason`. Every
other path to `failed` (a real provider error, from
`packages/core/src/orchestrator/one-shot.ts`'s `completeOnce`) only runs
once a turn has been **assigned** to a runtime — and assignment always nulls
`waiting_reason` first (`assign_or_park_chat_turn`'s success branch, line
341: `waiting_reason = null`). So **`status === "failed" && waitingReason !==
null`** is already, today, an unambiguous signal for "expired without ever
being picked up" — no schema change needed to detect it.

  Before relying on this in the UI: **confirm it live** against a real
  expired turn (see Traps) rather than trusting the trace above alone — SQL
  read correctly is still an inference, not a live observation, and this is
  exactly the class of thing M13 found wrong by testing rather than reading
  (`GET /chat/sessions/:id`'s shape). If it's wrong, the fallback is a
  one-line SQL fix in the sweep (an explicit `expired = true` boolean column,
  or leave `error` as the sole signal via string match) — not a redesign.

**4. `WaitingNotice` (chat.tsx, current lines ~169-176) becomes four
functions, not one with a switch inside its JSX** — clearer diffs when a
future task touches one reason's copy without disturbing the others:

```tsx
function NoRuntimePairedNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      This workspace has no paired machine yet — your message is saved.{" "}
      <Link to="/machines" className="underline underline-offset-2">
        Pair a machine
      </Link>{" "}
      to get a reply.
    </div>
  );
}

function AllOfflineNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      Waiting for a machine to come online — your message is saved, and the
      reply arrives automatically once one does.{" "}
      <Link to="/machines" className="underline underline-offset-2">
        Check Machines
      </Link>
    </div>
  );
}

function ProjectNotAvailableNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      No online machine has this project on disk. Pair or start the machine
      that has it, or{" "}
      <Link to="/machines" className="underline underline-offset-2">
        check Machines
      </Link>
      .
    </div>
  );
}

function TurnExpiredNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="spg-turn rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p className="font-medium">Took too long</p>
      <p className="mt-1 text-muted-foreground">
        No machine picked this up within 24 hours — your message is still
        here, but the wait ended.
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
```

  `onRetry` reuses `chat.tsx`'s existing `retry()` — M15 has not shipped a
  dedicated retry UI yet, so this task wires the button to the same function
  `TurnErrorBanner`'s retry already calls. That is not scope creep into M15:
  M14's own spec explicitly says "an expired turn's retry *offer* is
  rendered here... the retry *action* is M15's" — the action already exists
  from M12/M13, this task only exposes it on one more card.

## Checklist

- [x] Replace `chat.tsx`'s `WaitingNotice` with `NoRuntimePairedNotice`,
      `AllOfflineNotice`, `ProjectNotAvailableNotice`, `TurnExpiredNotice`
      (decision 4)
- [x] Update the turn-rendering block (`chat.tsx`, currently
      `{turn?.status === "waiting" && <WaitingNotice />}`) to switch on
      `turn.waitingReason` for the three waiting cards
- [x] Add the `status === "failed" && waitingReason !== null` branch
      (decision 3), rendering `TurnExpiredNotice`. Implemented as two
      mutually exclusive conditions (`waitingReason !== null` /
      `waitingReason === null`) rather than relying on JSX order to pick a
      winner — functionally the same "only one renders" guarantee the Traps
      section asks for, without depending on which branch is written first.
- [x] Confirm decision 3's signal live against one real expired turn (see
      Traps) before shipping it as the distinguishing check — not just by
      reading the SQL. **Done**, staging, twice: once via `execute_sql`
      alone (DB row only), once through the actual browser after a page
      reload — both showed `status='failed'`, `waiting_reason` untouched by
      the sweep, exactly as decision 3 predicted.
- [x] `packages/ui` typecheck and tests green

## Traps

**Don't trust decision 3's SQL trace without seeing one real expired row.**
The fastest way to get one without waiting 24 hours: update a real `waiting`
test turn's `wait_expires_at` to the past directly in Postgres (Supabase MCP
`execute_sql`, staging only), then trigger the sweep by polling
(`rescan_waiting_chat_turns` runs from `claim_runtime_commands`'s own
preamble — any online machine's next 3s poll fires it), then read that row's
`status`/`waiting_reason`/`error` back. If `waiting_reason` is NOT what
decision 3 predicts, stop and fix the SQL rather than working around it in
the UI — a UI heuristic papering over a real backend gap is exactly the kind
of thing this repo's KnownGaps discipline exists to catch, not hide.

**The `failed` branch order matters.** `chat.tsx` already renders
`TurnErrorBanner` for `turn?.status === "failed"` unconditionally
(T-M13-03). Adding the TTL-expired check as a second, later condition on the
same status is wrong — whichever renders first wins, and an expired turn
must never fall through to the generic banner (nor vice versa for a real
failure with a stale, non-null `waitingReason` from before it was assigned —
though decision 3's trace says that can't happen, which is exactly why it
needs the live check above).

**`AllOfflineNotice` is not `NoRuntimePairedNotice` reworded.** Scenario 1
("never paired anything, ever") and scenario 2 ("paired, but every machine
happens to be off right now") are different states with different next
actions for the owner — the first says "go pair one," the second says "go
check why the one you have is offline." Collapsing them into one generic
"no machine" card is the exact anti-pattern US2's spec exists to fix.

## Verification

- [x] Zero machines ever paired in a fresh workspace → `NoRuntimePairedNotice`
      renders, its link reaches `/machines`
- [x] A paired machine stopped (daemon killed) → `AllOfflineNotice` renders
      — verified by rendering a real `waiting`/`all_runtimes_offline` turn
      row rather than by actually killing a daemon (see Result)
- [x] A Project session bound to a project no online machine has checked out
      → `ProjectNotAvailableNotice` renders with the exact `start_run` wording
- [x] An expired turn (forced via the Traps section's SQL update, not a real
      24h wait) renders `TurnExpiredNotice`, distinct in appearance from
      `TurnErrorBanner`
- [x] The offline case (scenario 2) still resolves on its own once the
      machine reconnects within the TTL — closed live 2026-08-24 in a
      follow-up pass, see Result and T-M14-03

## On completion

- [x] Tick 18.12 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update [`M14/README.md`](README.md)'s task table

## Result

Built and verified live against **staging** (`pnymngoqseltgigcfevq`), through
this branch's own local dev server (`apps/web`, pointed at staging's
Supabase project) plus the Playwright MCP, per
`doc/runbooks/agent-browser-session.md`. Used a fresh disposable
`%@sparstrow.test` account rather than a real workspace.

**Verified live, in the browser, with a screenshot and a clean console for
each:**

- Scenario 1 (`no_runtime_paired`) — sent a real message in a brand-new,
  never-paired workspace. `NoRuntimePairedNotice` rendered with the exact
  copy from decision 4 and a working `/machines` link (confirmed via the
  anchor's `href`, not just visually).
- TTL expiry — forced a real `waiting` turn's `wait_expires_at` into the
  past and called `private.rescan_waiting_chat_turns` directly (the same
  function `claim_runtime_commands`'s poll loop calls), then reloaded the
  page. `status` became `failed`, `waiting_reason` stayed non-null
  (untouched by the sweep), and `TurnExpiredNotice` rendered — confirming
  decision 3's signal both at the DB layer and through the actual render
  path, in light and dark theme.
- Scenario 2 (`all_runtimes_offline`) and scenario 3
  (`project_not_available`) — rather than pairing and then stopping a real
  daemon (attempted first; see the note below on why that path was
  abandoned), inserted a `chat_turns`/`chat_messages` row pair directly with
  each `waiting_reason` value and loaded the session. Both
  `AllOfflineNotice` and `ProjectNotAvailableNotice` rendered with the
  correct copy, the correct links, and no console errors.
- Regression (checklist item B in T-M14-03) — inserted a `status: 'failed'`,
  `waiting_reason: null` turn with a real-looking error message.
  `TurnErrorBanner` rendered exactly as before (red/destructive tone),
  confirming the new `waitingReason !== null` branch does not swallow a
  genuine failure.

All four card states are visually distinct: the three waiting cards share a
muted dashed-border treatment but differ in text and the action offered;
`TurnExpiredNotice` uses `border-warning/40 bg-warning/10` (amber); the
regression check confirms `TurnErrorBanner` still uses
`border-destructive/30 bg-destructive/5` (red) — three genuinely different
visual languages, not one card reworded.

**Scenario 2b, closed in a follow-up pass, 2026-08-24.** The first attempt
(this pass) was to pair a real throwaway daemon (its own
`SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`, per the runbook) to the
disposable workspace and stop it before sending a message — but the pairing
endpoint sets the new runtime's status to `online` with a fresh heartbeat
immediately on pairing, before any daemon process ever connects, so the
turn it produced went straight to `in_progress` against a runtime that was
never actually running, rather than landing in `waiting`/`all_runtimes_offline`
the way a genuinely-stopped machine would. That made this specific pairing
unsuitable for a clean before/after "offline → online" walk. The real
fix wasn't a better pairing setup — it was testing against the OWNER'S
already-paired, already-proven-real machine instead of a fresh throwaway
one: stop it (a machine that has run before has a real, aging heartbeat,
no optimistic-online window), send a message, confirm `AllOfflineNotice`,
restart it, confirm the same turn resolves with no resend. Full evidence in
`KnownGaps.md`'s `G-31` "Closed, live, 2026-08-24" note.

**Cleanup note:** the disposable account
(`uipass-1787532059883@sparstrow.test`, workspace
`100362a2-ed1e-4730-b713-ee9d15c77366`) and its throwaway paired runtime
(`m14-test-machine`, id `7cb9432a-d2c6-49f2-83b4-fa7feaa425a3`) were **not**
deleted — the runbook's standard cleanup query was blocked by this session's
own auto-mode permission classifier as a destructive DB operation. Left in
place on staging; harmless (isolated, no real user data) but should be
swept the next time someone runs the runbook's cleanup query with
permission to do so.
