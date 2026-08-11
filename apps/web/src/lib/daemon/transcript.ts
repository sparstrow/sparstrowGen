import {
  TRANSCRIPT_BATCH_MAX_EVENTS,
  runEventTypeSchema,
  type RunEventPush,
  type TranscriptRejection,
} from "@sparstrow/shared";

/**
 * What makes a batch of transcript events acceptable.
 *
 * Pure, and separated from the route for the same two reasons `reconcile.ts`
 * is: this is the part with judgement in it, and a test that mocks a supabase
 * query builder to assert "a duplicate seq inside one batch is a 400" is mostly
 * testing the mock.
 *
 * The stakes are a little different here, though. `reconcile.ts` decides what a
 * report MEANS; this decides what is allowed to become a permanent row in
 * someone's transcript. A batch that is half-sane must be refused whole —
 * storing the good half makes the corruption permanent and silent, and the
 * daemon, believing it succeeded, advances its cursor past the rest.
 */

/** Hard ceiling on events per request. Twice the batch size, as slack for a replay. */
export const MAX_EVENTS_PER_REQUEST = TRANSCRIPT_BATCH_MAX_EVENTS * 2;

/**
 * Hard ceiling on the decoded body.
 *
 * Above the daemon's own byte budget, because that budget is measured on the
 * events and this is measured on the request. A daemon that exceeds this is
 * broken rather than busy, and a 400 says so; without it, the ceiling is
 * whatever the platform happens to enforce, discovered in production.
 */
export const MAX_BATCH_BYTES = 1024 * 1024;

export type BatchParse =
  | { ok: true; events: RunEventPush[] }
  | { ok: false; rejection: TranscriptRejection; detail: string };

function reject(rejection: TranscriptRejection, detail: string): BatchParse {
  return { ok: false, rejection, detail };
}

/**
 * Validate a batch body.
 *
 * Note what is NOT read here: `runId`, `workspaceId`, `runtimeId`. The run comes
 * from the path and is checked against the token's workspace by the route;
 * scope comes from the token and nowhere else. This function taking `unknown`
 * and returning only events is part of how that stays true — there is no field
 * on the return type through which a body-supplied scope could reach a query.
 */
export function parseEventBatch(body: unknown): BatchParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reject("malformed", "Body must be an object with an `events` array.");
  }

  const raw = (body as { events?: unknown }).events;
  if (!Array.isArray(raw)) {
    return reject("malformed", "`events` must be an array.");
  }
  if (raw.length === 0) {
    // Not merely useless: a daemon sending empty batches is looping, and a 200
    // would let it loop forever without anyone noticing.
    return reject("empty_batch", "`events` must contain at least one event.");
  }
  if (raw.length > MAX_EVENTS_PER_REQUEST) {
    return reject(
      "batch_too_large",
      `A batch may carry at most ${MAX_EVENTS_PER_REQUEST} events; received ${raw.length}.`,
    );
  }

  const events: RunEventPush[] = [];
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
      // Within ONE batch this is a daemon bug, and it is worth separating from
      // the across-batch case: a replay carrying seqs already stored is normal
      // and absorbed by the upsert, but the same seq twice in one array means
      // two different payloads are competing for one row and the winner is
      // whichever the database happens to apply last.
      return reject("duplicate_seq", `events[${i}].seq ${seq} appears twice in this batch.`);
    }
    seen.add(seq);

    if (!runEventTypeSchema.safeParse(e.type).success) {
      return reject(
        "invalid_type",
        `events[${i}].type is not a known run event type: ${JSON.stringify(e.type)}.`,
      );
    }

    const ts = e.ts;
    if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) {
      return reject("invalid_ts", `events[${i}].ts must be an ISO 8601 timestamp.`);
    }

    events.push({
      seq,
      ts,
      type: e.type as RunEventPush["type"],
      // Passed through untouched, including `undefined` → null. This is an
      // opaque provider line; anything that reshapes it corrupts a transcript
      // that will still render, which is the worst kind of corruption.
      payload: e.payload ?? null,
    });
  }

  // Ascending, so the rows go in as the transcript reads and `storedThroughSeq`
  // below is the last element rather than a scan. The daemon already sends them
  // in order; this makes the route not depend on that.
  events.sort((a, b) => a.seq - b.seq);

  return { ok: true, events };
}

/**
 * The highest `seq` the caller may now consider durable.
 *
 * Only meaningful for a batch that was stored **whole** — which is why the route
 * refuses a partially-valid batch rather than storing what it can. A cursor
 * advanced past an event that never landed is a permanent hole, and the daemon
 * has no way to discover it.
 */
export function storedThroughSeq(events: RunEventPush[]): number {
  return events.length === 0 ? -1 : events[events.length - 1].seq;
}

/** Rows for the upsert. `workspace_id` is the caller's — never the body's. */
export function toRunEventRows(
  workspaceId: string,
  runId: string,
  events: RunEventPush[],
): Array<Record<string, unknown>> {
  return events.map((e) => ({
    workspace_id: workspaceId,
    run_id: runId,
    seq: e.seq,
    // Passed through as the string the daemon sent. Parsing it into a Date here
    // and re-serialising would re-stamp every event in the offset of whichever
    // machine happened to run the route, shifting an entire transcript.
    ts: e.ts,
    type: e.type,
    payload: e.payload,
  }));
}

/** Rough decoded size of a body, for the ceiling above. */
export function approximateBodyBytes(body: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(body) ?? "", "utf8");
  } catch {
    // Circular or otherwise unserialisable. It cannot have come from JSON.parse,
    // so treat it as malformed rather than as enormous.
    return 0;
  }
}
