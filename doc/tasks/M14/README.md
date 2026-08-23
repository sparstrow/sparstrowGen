# M14 — nothing can answer, said plainly

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M14) |
| **Kind** | **serves US2** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine); overlaps M13's UI work — decompose after M13's rendering seam exists rather than alongside it |
| **Blocks** | M15 (retry needs a failed/expired turn to retry, which this phase is what produces honestly) |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US2 — Told plainly when nothing can answer** ([spec](../../specs/2026-08-23-chat-message-sending.md))
>
> The owner sends a message with no paired machine online. Instead of a
> dead-end error, they're told why nothing is happening and given the
> obvious next step.

**Acceptance scenarios this phase must satisfy:**

1. **Given** no machine has ever been paired, **When** the owner sends a
   message, **Then** they see "this needs a paired machine to reply" with a
   direct link to pairing — not a raw error string.
2. **Given** a paired machine is currently offline, **When** the owner sends
   a message in a Free or Agent session, **Then** they see "waiting for a
   machine to come online" — the message is not lost, and the reply arrives
   automatically once a machine picks it up (bounded by
   `CHAT_TURN_WAIT_TTL_MS`, 24h — T-M12-01).
3. **Given** a Project-context session where no paired machine has that
   project checked out locally, **When** the owner sends a message,
   **Then** they're told this project isn't available on any online
   machine, the same words `start_run` already produces.

**Independent test:** with zero paired machines (or all offline), send a
message and read what the owner is shown.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Chat waiting card | n/a — this surface only appears in the waiting state | n/a | n/a | The three `waitingReason` values (T-M12-02), each rendered as a distinct, actionable card with a pairing link |
| Wait-expiry state | n/a | n/a | n/a | TTL elapsed with nothing picking it up → "expired" state, offering M15's retry once that phase lands |

This phase doesn't ship a new "populated/empty/loading" surface of its own —
it ships the specific error/waiting states that M13's turn-rendering seam
already has a slot for.

## Tasks

Decomposed once M12 lands and M13's rendering seam exists. Expected shape,
from the plan's Work breakdown:

- Waiting-reason rendering: three distinct cards for `no_runtime_paired` / `all_runtimes_offline` / `project_not_available`, each with a real link to Machines/Settings pairing
- Wait-TTL expiry state: a turn that reaches `status='failed'` via T-M12-01's TTL sweep (rather than a provider error) is distinguished in the UI as "took too long" rather than a generic failure
- `project_not_available` reuses `runtime_projects`'s binding state and `start_run`'s existing wording (US2.3) — not a new copy of the same message
- Verification task `[S]`, walking US2's three acceptance scenarios, including the offline-then-comes-back-within-TTL case

## Objective

Make the waiting states from M12's spine visible and actionable, so a quiet
install reads as correctly waiting rather than broken.

## Definition of done

- The spec's US2 acceptance scenarios 1–3, walked live: zero paired, paired
  but offline, Project session with no bound online machine.
- The offline case answers itself once a machine comes online within the TTL
  — walked live, not just asserted at the database layer (M12's own
  verification already covers the database layer).
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** retry (M15) — an expired turn's retry *offer* is
rendered here (per the acceptance scenario), but the retry *action* is
M15's.

---

## Traps

**"Waiting" and "failed" must be visually and textually distinct.** A turn
that's still within its TTL and one that just expired are both, structurally,
non-`succeeded` — if the UI collapses them into one generic "something's
wrong" treatment, US2.2's promise ("not lost, arrives automatically") reads
as broken even when it isn't.

**Don't build a settings dial for the TTL.** The plan's Scope boundaries
section already ran the `AGENTS.md` §14 settings check and concluded no
settings entry is warranted — a user-facing TTL configuration control would
be exactly the over-engineering §9 forbids for a failure path the owner
should rarely see.

## Verification

Full procedure in the phase's verification task, once decomposed. Graded
against the spec's SC-002.
