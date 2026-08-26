import {
  CHAT_TURN_BROADCAST_EVENT,
  TRANSCRIPT_BATCH_MAX_BYTES,
  TRANSCRIPT_BROADCAST_EVENT,
  chatTurnTopic,
  runTranscriptTopic,
  type ChatTurnBroadcast,
  type ChatTurnEventPush,
  type RunEventPush,
  type TranscriptBroadcast,
} from "@sparstrow/shared";
import { supabaseUrl } from "@web/utils/supabase/env";

/**
 * M5 — the live half of the transcript's dual path.
 *
 * The durable write has already committed by the time anything here runs. This
 * sends the same batch to whoever is watching the run, and it is allowed to
 * fail: a missed delta is covered by the client's `seq` merge and its refetch,
 * whereas failing the request would make the daemon replay a batch that is
 * already stored.
 *
 * ─── Why the server sends and the daemon does not ───────────────────────────
 *
 * This module runs inside a route that already holds the service role and has
 * already resolved the workspace from a bearer token, so a runtime physically
 * cannot broadcast into another workspace's channel — the topic is built from
 * the token's scope, not from anything the caller said.
 *
 * Sending from the daemon instead would need a custom `runtime_id` JWT, an
 * endpoint to mint it, a refresh timer in core, and `realtime.messages`
 * policies that understand a principal with no `auth.uid()`. See
 * doc/tasks/M5/README.md decision 1.
 *
 * ─── HTTP, not a channel ────────────────────────────────────────────────────
 *
 * `supabase.channel().send()` opens a WebSocket. A route handler is a
 * short-lived function; opening a socket, subscribing, sending one message and
 * tearing it down costs more than the message and can outlive the response.
 * The REST endpoint is stateless, which is what this caller is.
 */

/** Chunks and the seqs too large to carry in any of them. */
export interface BroadcastPlan<T> {
  chunks: T[][];
  /** Stored durably, too big to broadcast. The client refetches these. */
  oversized: number[];
}

function encodedBytes(events: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(events), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Split a batch into messages that fit.
 *
 * The daemon already batches under the same ceiling, so in the steady state
 * this produces one chunk and does nothing. It earns its place on the replay
 * path: a catch-up batch after an outage is far larger than a live one, and
 * that is exactly the moment the transcript matters most.
 *
 * Measured on the encoded bytes rather than on the sum of the payload sizes —
 * the envelope, the JSON escaping of payloads that are already JSON, and base64
 * inside tool results all inflate the wire size above what was measured
 * locally.
 */
export function planBroadcast<T extends { seq: number }>(
  events: T[],
  maxBytes: number = TRANSCRIPT_BATCH_MAX_BYTES,
): BroadcastPlan<T> {
  const chunks: T[][] = [];
  const oversized: number[] = [];
  let current: T[] = [];

  for (const event of events) {
    const alone = encodedBytes([event]);
    if (alone > maxBytes) {
      // One event that cannot fit in any message. It IS stored — only the live
      // delivery is skipped — so the client is told its seq and refetches it.
      // Dropping it silently would leave a transcript that appears to end.
      if (current.length > 0) {
        chunks.push(current);
        current = [];
      }
      oversized.push(event.seq);
      continue;
    }

    const next = [...current, event];
    if (current.length > 0 && encodedBytes(next) > maxBytes) {
      chunks.push(current);
      current = [event];
    } else {
      current = next;
    }
  }

  if (current.length > 0) chunks.push(current);
  return { chunks, oversized };
}

function serviceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return value;
}

async function send(topic: string, event: string, payload: unknown): Promise<void> {
  const key = serviceRoleKey();
  const response = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic, event, payload, private: true }],
    }),
  });

  if (!response.ok) {
    // Status only. The body of a rejected broadcast can echo the message back,
    // and the message is the user's transcript.
    throw new Error(`realtime broadcast returned ${response.status}`);
  }
}

/**
 * Fan a stored batch out to the run's subscribers.
 *
 * Never throws. Every failure mode here — Realtime down, the key absent, the
 * payload rejected — leaves a transcript that is already durable and a client
 * that will refetch. Propagating would turn a cosmetic delay into a 500 that
 * makes the daemon resend rows it has already stored.
 *
 * That also subsumes the configuration case: this needs the same
 * `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` the route's
 * authentication already required, so a deployment reaching this line with
 * either missing has bigger problems — and gets a logged warning rather than a
 * failed write.
 */
export async function broadcastRunEvents(
  workspaceId: string,
  runId: string,
  events: RunEventPush[],
): Promise<void> {
  const topic = runTranscriptTopic(workspaceId, runId);
  const { chunks, oversized } = planBroadcast(events);

  try {
    for (let i = 0; i < chunks.length; i++) {
      const payload: TranscriptBroadcast = {
        runId,
        events: chunks[i],
        // Attached to the first message so a subscriber learns about the gap
        // even if a later chunk is lost.
        ...(i === 0 && oversized.length > 0 ? { oversized } : {}),
      };
      await send(topic, TRANSCRIPT_BROADCAST_EVENT, payload);
    }

    // Every event was too large for any message — no chunk to attach the
    // marker to, and the client still needs to know something is there.
    if (chunks.length === 0 && oversized.length > 0) {
      await send(topic, TRANSCRIPT_BROADCAST_EVENT, { runId, events: [], oversized });
    }
  } catch (err) {
    // Run id and counts only. The events are prompts, file contents and tool
    // output, and `err` from a fetch can carry the request body.
    console.warn("transcript broadcast failed", {
      runId,
      count: events.length,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fan a chat turn's deltas (or its terminal result) out to the session's
 * subscribers. Same discipline as `broadcastRunEvents`: never throws, and is
 * always called AFTER the durable `ingest_chat_turn_reply` write, never
 * before — a missed broadcast is covered by the client's own refetch, a
 * failed durable write must not be masked by a live message that implies it
 * succeeded.
 *
 * `events` here is the batch as received (not narrowed to the one event that
 * was actually persisted) so subscribers still see intermediate deltas
 * progressively rather than jumping straight to the final text — see
 * `chat-transcript.ts`'s `latestOf` for why only the tail needs to be
 * durable.
 */
export async function broadcastChatTurnEvents(
  workspaceId: string,
  sessionId: string,
  turnId: string,
  events: ChatTurnEventPush[],
  status: ChatTurnBroadcast["status"],
  error?: string | null,
): Promise<void> {
  const topic = chatTurnTopic(workspaceId, sessionId);
  const { chunks, oversized } = planBroadcast(events);
  const terminal = status === "succeeded" || status === "failed";

  try {
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const payload: ChatTurnBroadcast = {
        turnId,
        events: chunks[i],
        // Only the LAST message of a terminal call carries the terminal
        // status -- an intermediate chunk from the same request is still
        // "running" as far as a subscriber should render it.
        status: terminal && isLast ? status : "running",
        ...(terminal && isLast && error ? { error } : {}),
      };
      await send(topic, CHAT_TURN_BROADCAST_EVENT, payload);
    }

    // Every event was too large for any message, or a terminal call with no
    // events to chunk (should not happen -- the result route always sends
    // exactly one) -- either way the terminal status must still land.
    if (chunks.length === 0 && (oversized.length > 0 || terminal)) {
      const payload: ChatTurnBroadcast = {
        turnId,
        events: [],
        status,
        ...(error ? { error } : {}),
      };
      await send(topic, CHAT_TURN_BROADCAST_EVENT, payload);
    }
  } catch (err) {
    // Turn id and counts only -- the events are the reply text itself.
    console.warn("chat turn broadcast failed", {
      turnId,
      count: events.length,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
