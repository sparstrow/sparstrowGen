import type { ChatActivity, ChatTurnEventPush, ChatTurnProducedFile, ChatTurnResultPayload } from "@sparstrow/shared";

/**
 * What makes a batch of chat-turn deltas acceptable at the daemon boundary.
 *
 * Mirrors `transcript.ts`'s `parseEventBatch` in spirit (DD-8: strict
 * whole-batch parse, reject rather than store a valid subset) but the shape
 * is simpler — a chat event carries only `seq` and the full accumulated
 * `replyText`, no `type`/`ts`/`payload`. See doc/tasks/M12/T-M12-03.
 */

/** Hard ceiling on events per request. A daemon flushing more than this per
 *  batch is broken, not merely chatty. */
export const MAX_CHAT_EVENTS_PER_REQUEST = 100;

/** Hard ceiling on the decoded body — same reasoning as transcript.ts's. */
export const MAX_CHAT_BATCH_BYTES = 1024 * 1024;

/**
 * A single reply may not exceed this many bytes — the sibling ceiling to
 * `CHAT_MESSAGE_MAX_BYTES` on the user's own message, so neither side of a
 * chat turn can grow unbounded.
 */
export const MAX_CHAT_REPLY_BYTES = 512 * 1024;

/**
 * AM1 (T-AM1-03). A daemon reporting more than this per turn is broken, not
 * merely prolific — the byte-level content is already bounded by each file's
 * own `CHAT_PRODUCED_MAX_BYTES` ceiling at upload time; this bounds the
 * COUNT of descriptors in one request body.
 */
export const MAX_CHAT_PRODUCED_PER_REQUEST = 20;

export type ChatBatchRejection =
  | "empty_batch"
  | "batch_too_large"
  | "invalid_seq"
  | "duplicate_seq"
  | "invalid_reply_text"
  | "reply_too_large"
  | "malformed";

export type ChatBatchParse =
  | { ok: true; events: ChatTurnEventPush[] }
  | { ok: false; rejection: ChatBatchRejection; detail: string };

function reject(rejection: ChatBatchRejection, detail: string): ChatBatchParse {
  return { ok: false, rejection, detail };
}

/** Validate a streamed-delta batch body for `POST .../chat/turns/:id/events`. */
export function parseChatEventBatch(body: unknown): ChatBatchParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reject("malformed", "Body must be an object with an `events` array.");
  }

  const raw = (body as { events?: unknown }).events;
  if (!Array.isArray(raw)) {
    return reject("malformed", "`events` must be an array.");
  }
  if (raw.length === 0) {
    // A daemon posting an empty batch is looping; a 200 would let it loop
    // forever without anyone noticing (same reasoning as transcript.ts).
    return reject("empty_batch", "`events` must contain at least one event.");
  }
  if (raw.length > MAX_CHAT_EVENTS_PER_REQUEST) {
    return reject(
      "batch_too_large",
      `A batch may carry at most ${MAX_CHAT_EVENTS_PER_REQUEST} events; received ${raw.length}.`,
    );
  }

  const events: ChatTurnEventPush[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return reject("malformed", `events[${i}] must be an object.`);
    }
    const e = item as Record<string, unknown>;

    const seq = e.seq;
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) {
      return reject("invalid_seq", `events[${i}].seq must be a non-negative integer.`);
    }
    if (seen.has(seq)) {
      return reject("duplicate_seq", `events[${i}].seq ${seq} appears twice in this batch.`);
    }
    seen.add(seq);

    const replyText = e.replyText;
    if (typeof replyText !== "string") {
      return reject("invalid_reply_text", `events[${i}].replyText must be a string.`);
    }
    if (Buffer.byteLength(replyText, "utf8") > MAX_CHAT_REPLY_BYTES) {
      return reject(
        "reply_too_large",
        `events[${i}].replyText exceeds ${MAX_CHAT_REPLY_BYTES} bytes.`,
      );
    }

    const rawActivities = e.activities;
    const activities: ChatActivity[] | undefined = Array.isArray(rawActivities) ? (rawActivities as ChatActivity[]) : undefined;

    events.push({ seq, replyText, activities });
  }

  // Ascending, matching transcript.ts's own reasoning: the daemon already
  // sends them in order, this makes the route not depend on that.
  events.sort((a, b) => a.seq - b.seq);

  return { ok: true, events };
}

/**
 * The event this batch should actually persist — the highest `seq`.
 *
 * Every event already carries the FULL accumulated reply, not a delta, so an
 * earlier event in the same batch is strictly superseded by a later one.
 * Persisting only the tail reaches the same durable state as persisting all
 * of them, in one write instead of N — `ingest_chat_turn_reply`'s own
 * `p_seq <= reply_seq` guard makes either choice idempotent under a replay,
 * so this is not a correctness trade, only a cheaper one.
 */
export function latestOf(events: ChatTurnEventPush[]): ChatTurnEventPush {
  const last = events[events.length - 1];
  if (!last) {
    // `server/` compiles with `noUncheckedIndexedAccess`, which `apps/web` did
    // not, so this case had to be faced rather than assumed away. It is
    // genuinely unreachable from the routes: `parseChatEventBatch` rejects an
    // empty array before this is ever called. Throwing rather than returning a
    // fabricated event, because a synthetic seq 0 with an empty reply would
    // overwrite a real reply with nothing.
    throw new Error("latestOf called with no events — parseChatEventBatch should have rejected this");
  }
  return last;
}

export type ChatResultParse =
  | { ok: true; result: ChatTurnResultPayload }
  | { ok: false; rejection: ChatBatchRejection; detail: string };

/** Validate the terminal body for `POST .../chat/turns/:id/result`. */
export function parseChatResult(body: unknown): ChatResultParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, rejection: "malformed", detail: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const seq = b.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) {
    return { ok: false, rejection: "invalid_seq", detail: "seq must be a non-negative integer." };
  }

  const replyText = b.replyText;
  if (typeof replyText !== "string") {
    return { ok: false, rejection: "invalid_reply_text", detail: "replyText must be a string." };
  }
  if (Buffer.byteLength(replyText, "utf8") > MAX_CHAT_REPLY_BYTES) {
    return {
      ok: false,
      rejection: "reply_too_large",
      detail: `replyText exceeds ${MAX_CHAT_REPLY_BYTES} bytes.`,
    };
  }

  const status = b.status;
  if (status !== "succeeded" && status !== "failed") {
    return { ok: false, rejection: "malformed", detail: "status must be succeeded or failed." };
  }

  const error = b.error;
  if (error !== undefined && error !== null && typeof error !== "string") {
    return { ok: false, rejection: "malformed", detail: "error must be a string when present." };
  }

  const rawProduced = b.produced;
  if (rawProduced !== undefined && !Array.isArray(rawProduced)) {
    return { ok: false, rejection: "malformed", detail: "produced must be an array when present." };
  }
  const producedInput = (rawProduced ?? []) as unknown[];
  if (producedInput.length > MAX_CHAT_PRODUCED_PER_REQUEST) {
    return {
      ok: false,
      rejection: "malformed",
      detail: `produced may not exceed ${MAX_CHAT_PRODUCED_PER_REQUEST} entries; received ${producedInput.length}.`,
    };
  }

  const produced: ChatTurnProducedFile[] = [];
  for (let i = 0; i < producedInput.length; i++) {
    const item = producedInput[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, rejection: "malformed", detail: `produced[${i}] must be an object.` };
    }
    const f = item as Record<string, unknown>;

    if (typeof f.storagePath !== "string" || !f.storagePath) {
      return { ok: false, rejection: "malformed", detail: `produced[${i}].storagePath must be a non-empty string.` };
    }
    if (typeof f.filename !== "string" || !f.filename) {
      return { ok: false, rejection: "malformed", detail: `produced[${i}].filename must be a non-empty string.` };
    }
    if (typeof f.mimeType !== "string" || !f.mimeType) {
      return { ok: false, rejection: "malformed", detail: `produced[${i}].mimeType must be a non-empty string.` };
    }
    if (typeof f.sizeBytes !== "number" || !Number.isInteger(f.sizeBytes) || f.sizeBytes < 0) {
      return { ok: false, rejection: "malformed", detail: `produced[${i}].sizeBytes must be a non-negative integer.` };
    }

    produced.push({
      storagePath: f.storagePath,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    });
  }

  const rawActivities = b.activities;
  const activities: ChatActivity[] | undefined = Array.isArray(rawActivities) ? (rawActivities as ChatActivity[]) : undefined;

  return {
    ok: true,
    result: { seq, replyText, status, error: (error as string | null) ?? null, produced, activities },
  };
}
