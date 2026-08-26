# M15 — retry

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M15) |
| **Kind** | **serves US3** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine), M13 (turn rendering to retry from) |
| **Blocks** | nothing |
| **Status** | 🟢 built and fully live-verified — retry-twice closed live 2026-08-24 (see [`KnownGaps.md`](../../KnownGaps.md)'s `G-31` "Closed, live" note) |
| **Open questions** | none |

## The story this serves

> **US3 — Retry a turn** ([spec](../../specs/2026-08-23-chat-message-sending.md))
>
> The owner didn't like a reply, or it failed partway, and wants to try
> again — optionally with a different model — without retyping their
> message.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a turn that failed partway through, **When** the owner presses
   retry, **Then** the same message is resent and a fresh reply attempt
   starts, without retyping.
2. **Given** a completed reply the owner wants redone with a different
   model, **When** they retry and pick a different model, **Then** the new
   reply uses that model and the original reply stays visible in history.

**Independent test:** after a completed or failed turn, use retry and
confirm the original message isn't lost and a new reply arrives.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Retry affordance | Visible on `succeeded`, `failed`, and `expired` (M14) turns | n/a | Retry button disabled while the new turn is `waiting`/`in_progress` | A retry that itself fails renders the same way any failed turn does — no special-cased error UI |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M15-01 — retry affordance on succeeded and failed turns, with a model picker](T-M15-01-retry-affordance.md) | `[S]` | US3 | — | 🟢 done |
| [T-M15-02 — the Knowledge Center says a reply can be retried](T-M15-02-knowledge-center.md) | `[P]` | US3 | — | 🟢 done |
| [T-M15-03 — verification](T-M15-03-verification.md) | `[S]` | US3 | 15.1, 15.2 | 🟢 done — retry-twice closed live 2026-08-24 |

## The shape of what was found

Same finding as M14: reading the actual shipped M12 code before decomposing
turned up that **M15 needs no new backend work at all**. `retry_chat_turn`
(`packages/shared/drizzle/policies/014_chat_turn_dispatch.sql:499-566`)
already accepts an optional provider/model override and already works from
either a `succeeded` or `failed` source turn, always inserting a NEW turn
and message row rather than touching the original — so "the original reply
stays in history" (US3 scenario 2) was already true before this phase
existed. `POST /chat/sessions/:id/retry` already forwards the override
verbatim. This phase is a rendering change end to end: today `chat.tsx` has
retry wired to `TurnErrorBanner`'s plain button (failed) and
`TurnExpiredNotice`'s plain button (M14, expired), but **nothing on a
succeeded turn** — see [T-M15-01](T-M15-01-retry-affordance.md) decision 1.

The `TurnErrorBanner`'s existing `onRetrySecondary`/`fallback` field, which
looks like it should already handle "retry with a different model," is
dead on the cloud path — `turnErrorFromState` always sets `fallback: null`
(a cost T-M13-02's Result already flagged). T-M15-01 adds a real picker
rather than trying to revive that field — see its decision 2.

## Objective

Let the owner re-ask without retyping, closing the loop M12's
`retry_chat_turn` function already opened.

## Definition of done

- The spec's US3 acceptance scenarios 1–2, walked live: retry after failure,
  retry with a different model after success.
- The original message is never re-entered by the owner in either case.
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** nothing further — this is the plan's last phase. Once
this lands and its verification passes, `doc/plans/2026-08-23-chat-message-sending.md`'s
Status becomes `✅ Completed`.

---

## Traps

**Retry must not silently reuse the original turn's row.** T-M12-01's
`retry_chat_turn` already creates a new turn and a new `chat_messages` row
by design (§ "Retry never reuses the original chat_messages row") — a UI
that tries to be clever and update the original message in place would
fight the schema and lose the "previous reply stays in history" guarantee
US3.2 asks for.

## Verification

Full procedure in the phase's verification task, once decomposed. Graded
against the spec's SC-003.
