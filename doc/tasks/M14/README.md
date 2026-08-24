# M14 — nothing can answer, said plainly

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M14) |
| **Kind** | **serves US2** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine); overlaps M13's UI work — decompose after M13's rendering seam exists rather than alongside it |
| **Blocks** | M15 (retry needs a failed/expired turn to retry, which this phase is what produces honestly) |
| **Status** | 🟢 built and fully live-verified — scenario 2b closed live 2026-08-24 (see [`KnownGaps.md`](../../KnownGaps.md)'s `G-31` "Closed, live" note) |
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

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M14-01 — three waiting-reason cards, and TTL-expiry told apart from a real failure](T-M14-01-waiting-reason-cards.md) | `[S]` | US2 | — | 🟢 done |
| [T-M14-02 — the Knowledge Center names the specific waiting states and the 24h wait](T-M14-02-knowledge-center.md) | `[P]` | US2 | — | 🟢 done |
| [T-M14-03 — verification](T-M14-03-verification.md) | `[S]` | US2 | 14.1, 14.2 | 🟢 done — scenario 2b closed live 2026-08-24 |

T-M14-01 and T-M14-02 are genuinely parallel: one is `packages/ui/src/routes/pages/chat.tsx`,
the other is a single Knowledge Center markdown file, zero overlap.

## The shape of what was found

Reading the actual shipped M12/M13 code (not the plan's abstract outline)
before decomposing turned up two things worth naming.

**M14 needs no new backend at all.** `waitingReason`'s three values are
already computed by `assign_or_park_chat_turn` and already ride the wire on
every `ChatTurnState`, unused by the UI since M13 shipped only the one
generic waiting card. This phase is a rendering change end to end — see
T-M14-01 decision 1.

**There is no `'expired'` status, and there doesn't need to be one.** The
TTL sweep (`rescan_waiting_chat_turns`) marks an overdue turn `status =
'failed'` with a fixed error string, not a new status value. What makes it
distinguishable from a genuine provider failure is that the sweep never
clears `waiting_reason`, while every path to a REAL failure only runs after
a turn was assigned — and assignment always nulls `waiting_reason` first.
`status === "failed" && waitingReason !== null` is therefore already,
today, the signal T-M14-01 needs — inferred from reading the SQL, and since
confirmed live on staging (forced a real turn past its TTL, ran the actual
sweep function, read the row back, then rendered it in the browser): the
signal holds exactly as predicted.

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

Full procedure and Result in [T-M14-03](T-M14-03-verification.md). Graded
against the spec's SC-002.
