# T-M14-01 — three waiting-reason cards, and TTL-expiry told apart from a real failure

| | |
|---|---|
| **Tag** | `[S]` — edits `chat.tsx`, the same file T-M13-03 rewrote and the concurrent `chat-context-menu-design-0eb2ff` worktree (unmerged) is also editing (~205 lines, a context-menu feature). Check `development` before starting; this task's edits are additive to the turn-rendering block T-M13-03 shipped, not a rewrite of it. |
| **Serves** | US2 — scenarios 1, 2, 3 |
| **Depends on** | M13 (done) — `ChatTurnState.waitingReason` and the generic `WaitingNotice` this task replaces |
| **Blocks** | T-M14-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Replace `chat.tsx`'s `WaitingNotice` with `NoRuntimePairedNotice`,
      `AllOfflineNotice`, `ProjectNotAvailableNotice`, `TurnExpiredNotice`
      (decision 4)
- [ ] Update the turn-rendering block (`chat.tsx`, currently
      `{turn?.status === "waiting" && <WaitingNotice />}`) to switch on
      `turn.waitingReason` for the three waiting cards
- [ ] Add the `status === "failed" && waitingReason !== null` branch
      (decision 3), rendering `TurnExpiredNotice` — this must come BEFORE
      the existing generic `TurnErrorBanner` branch for `failed`, since both
      match `status === "failed"` and only one should render
- [ ] Confirm decision 3's signal live against one real expired turn (see
      Traps) before shipping it as the distinguishing check — not just by
      reading the SQL
- [ ] `packages/ui` typecheck and tests green

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

- [ ] Zero machines ever paired in a fresh workspace → `NoRuntimePairedNotice`
      renders, its link reaches `/machines`
- [ ] A paired machine stopped (daemon killed) → `AllOfflineNotice` renders
- [ ] A Project session bound to a project no online machine has checked out
      → `ProjectNotAvailableNotice` renders with the exact `start_run` wording
- [ ] An expired turn (forced via the Traps section's SQL update, not a real
      24h wait) renders `TurnExpiredNotice`, distinct in appearance from
      `TurnErrorBanner`
- [ ] The offline case (scenario 2) still resolves on its own once the
      machine reconnects within the TTL — full walk belongs to
      [T-M14-03](T-M14-03-verification.md), not repeated here

## On completion

- [ ] Tick 18.12 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update [`M14/README.md`](README.md)'s task table

## Result

<!-- Filled in when the task lands. -->
