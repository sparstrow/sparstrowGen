# M15 — retry

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M15) |
| **Kind** | **serves US3** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine), M13 (turn rendering to retry from) |
| **Blocks** | nothing |
| **Status** | not started |
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

Decomposed once M12 and M13 land. Expected shape, from the plan's Work
breakdown:

- `POST /chat/sessions/:id/retry` calls `retry_chat_turn` (T-M12-01), with an
  optional `{ provider, model }` body
- Retry affordance rendered on failed, expired, and completed turns —
  distinct from a plain "send another message," which stays a separate
  composer action
- Model-override picker for retry, reusing whatever model-selection UI the
  composer already has rather than inventing a second one
- Verification task `[S]`, walking US3's two acceptance scenarios

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
