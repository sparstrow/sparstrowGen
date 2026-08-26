import type { ChatTurnBroadcast, ChatTurnState, ChatTurnStatus } from "@sparstrow/shared";

/**
 * M13 — one merge point for a chat turn's state, replacing the three
 * independent pieces of component state (`pending`, `turnErrors`, a derived
 * `busy`) `chat.tsx` used to hold. The turn arrives from three places and the
 * server is authoritative over all of them:
 *
 *   - `detail.activeTurn`  — from `GET /chat/sessions/:id`, authoritative on
 *     mount and after any refetch
 *   - the send/retry POST response — authoritative the instant it returns
 *   - `subscribeChat` deltas — authoritative while the turn is non-terminal
 *
 * Written as pure functions so the ordering rules are unit-testable without
 * mounting the page (same reason `chat-pending.ts` and `enqueue.ts` are
 * separate files rather than inline component logic).
 */

/**
 * Apply a full `ChatTurnState` — from a POST/retry response or a session
 * refetch. A different turn id (a retry created a new turn, or the session
 * changed) always wins outright. The SAME turn id only wins if it is at
 * least as far along as what's held: a `GET` refetch can race a newer
 * streamed delta and land after it, and must not regress the reply that is
 * already rendered.
 */
export function applyChatTurnState(
  current: ChatTurnState | null,
  incoming: ChatTurnState,
): ChatTurnState {
  if (!current || current.id !== incoming.id) return incoming;
  return incoming.replySeq >= current.replySeq ? incoming : current;
}

/** True if a broadcast is for the turn currently held — see
 *  `applyChatTurnBroadcast`'s doc comment for what to do when it is not. */
export function isBroadcastForHeldTurn(
  current: ChatTurnState | null,
  delta: ChatTurnBroadcast,
): boolean {
  return current != null && current.id === delta.turnId;
}

/** `ChatTurnBroadcast.status` uses "running"; `ChatTurnState.status` uses
 *  "in_progress" — mapped here once rather than at every call site. */
function statusFromBroadcast(status: ChatTurnBroadcast["status"]): ChatTurnStatus {
  return status === "running" ? "in_progress" : status;
}

/**
 * Merge one broadcast batch into the currently-held turn.
 *
 * `chatTurnTopic` is per SESSION, not per turn (`chatTurnTopic`'s own doc
 * comment), so a broadcast can legitimately arrive for a turn other than the
 * one held — a retry fired from another tab, most commonly. A broadcast
 * carries no `userMessage`, so a different turn can never be materialized
 * from it alone: this function returns `current` UNCHANGED in that case, and
 * the caller (`chat.tsx`) is responsible for noticing the mismatch and
 * refetching the session, which arrives back through `applyChatTurnState`
 * above — the only place a turn's full shape is ever constructed.
 *
 * `ChatTurnEventPush.replyText` is always the full accumulated text as of
 * `seq`, never a delta (see its own doc comment in `packages/shared/src/cloud.ts`),
 * so applying a batch is "take the highest-`seq` event", not a concatenation.
 * A batch already seen (replayed, or arriving out of order) is a no-op.
 */
export function applyChatTurnBroadcast(
  current: ChatTurnState | null,
  delta: ChatTurnBroadcast,
): ChatTurnState | null {
  if (!isBroadcastForHeldTurn(current, delta)) return current;
  const held = current!;

  const latest = delta.events.reduce<(typeof delta.events)[number] | null>(
    (best, event) => (!best || event.seq > best.seq ? event : best),
    null,
  );
  if (!latest || latest.seq < held.replySeq) return held;

  return {
    ...held,
    replyText: latest.replyText,
    replySeq: latest.seq,
    status: statusFromBroadcast(delta.status),
    error: delta.error ?? held.error,
  };
}

/** A turn the owner is waiting on — the composer disables and the reply area
 *  shows a working indicator. Derived from server state, not from whether a
 *  mutation happens to be in flight in this tab (T-M13-03 decision 3): a
 *  reload resets `isPending` while the server's turn keeps running. */
export function isTurnBusy(turn: ChatTurnState | null): boolean {
  return turn != null && (turn.status === "waiting" || turn.status === "in_progress");
}
