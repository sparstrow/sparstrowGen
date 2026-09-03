import { NextResponse } from "next/server";
import type { RunEventBatchResponse } from "@sparstrow/shared";
import { authenticateRuntime, daemonDb } from "@web/lib/daemon/auth";
import { broadcastRunEvents } from "@web/lib/daemon/broadcast";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";
import {
  MAX_BATCH_BYTES,
  approximateBodyBytes,
  parseEventBatch,
  storedThroughSeq,
  toRunEventRows,
} from "@web/lib/daemon/transcript";

/**
 * M5 — the durable half of the transcript's dual path.
 *
 * A machine hands over a batch of run events; they land in `run_events` exactly
 * once. The live half broadcasts the same batch from this route
 * (T-M5-02) — the daemon never touches Realtime, because this handler already
 * holds the service role and has already resolved the workspace from the bearer
 * token. See doc/tasks/M5/README.md decision 1.
 *
 * ─── Idempotent by primary key, not by hope ─────────────────────────────────
 *
 * `run_events` is keyed on `(run_id, seq)`, which M1 chose for exactly this: the
 * daemon retries a batch whose response was lost, so the same events arrive
 * twice. `ignoreDuplicates` makes a replay free and means the pusher never has
 * to know whether its last request landed before the socket died.
 *
 * Do not "optimise" this into a plain insert after noticing duplicates are rare.
 * Rare is the whole problem.
 *
 * ─── Whole batches only ─────────────────────────────────────────────────────
 *
 * A batch with one bad event is refused entirely. Storing the sane subset makes
 * the corruption permanent, and — worse — the daemon reads a success and
 * advances its cursor past the events that never landed. There is no later
 * moment at which anyone could discover the hole.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await authenticateRuntime(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const { id } = await params;
  const body = await readJson(request);

  if (approximateBodyBytes(body) > MAX_BATCH_BYTES) {
    return daemonError(
      413,
      "invalid_request",
      `A transcript batch may not exceed ${MAX_BATCH_BYTES} bytes.`,
    );
  }

  const parsed = parseEventBatch(body);
  if (!parsed.ok) {
    // The rejection token travels in `error` text rather than as `reason`,
    // because `DaemonErrorReason` is a closed set shared with the CLI and the
    // pairing flow. A malformed batch is a daemon bug: it needs to be legible
    // in a log, not branched on.
    return daemonError(400, "invalid_request", `${parsed.rejection}: ${parsed.detail}`);
  }

  const db = daemonDb();

  // Ownership BEFORE the write, and separately from it.
  //
  // M4's status route shipped this the other way round and it took a live pass
  // to catch: folding ownership into the write's `where` made "this run is not
  // yours" indistinguishable from "your write was a no-op", and workspace B
  // reporting on workspace A's run got a cheerful `ok: true` while nothing
  // happened. An upsert has no such tell at all — it would report rows stored
  // for a run in another workspace and be believed.
  //
  // A run in another workspace and a run that does not exist return the SAME
  // 404, so this cannot be used to discover run ids.
  //
  // `target_runtime_id` is in the filter as well as the workspace, matching the
  // status route: a machine may only stream transcripts for runs the control
  // plane actually gave it. Without it, any paired machine in a workspace could
  // write into any run's transcript in that workspace.
  const { data: owned, error: lookupError } = await db
    .from("runs")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", auth.scope.workspaceId)
    .eq("target_runtime_id", auth.scope.runtimeId)
    .maybeSingle();

  if (lookupError) {
    console.error("run event lookup failed", { runId: id, message: lookupError.message });
    return daemonError(500, "server_error", "Could not record the transcript events.");
  }
  if (!owned) {
    return daemonError(404, "invalid_request", "No such run for this machine.");
  }

  const rows = toRunEventRows(auth.scope.workspaceId, id, parsed.events);

  const { data, error } = await db
    .from("run_events")
    .upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true })
    .select("seq");

  if (error) {
    // The batch itself is NEVER logged. Payloads are prompts, file contents and
    // tool output; a failed-upsert line with the rows attached puts a user's
    // source code in a platform log. A run id and a seq range is enough to find
    // anything worth finding.
    console.error("run event upsert failed", {
      runId: id,
      firstSeq: parsed.events[0].seq,
      lastSeq: storedThroughSeq(parsed.events),
      count: rows.length,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not record the transcript events.");
  }

  const stored = data?.length ?? 0;

  // Live delta, AFTER the durable write and never before. If this half fails
  // the request still succeeds: the rows are committed, and the client's `seq`
  // merge plus its refetch cover a missed message. Failing here would make the
  // daemon resend a batch it has already stored.
  //
  // The topic is built from the token's workspace, so a runtime cannot
  // broadcast into another workspace's channel even in principle.
  //
  // Awaited rather than fire-and-forget: this is a serverless function, and
  // work left running after the response is not guaranteed to finish.
  await broadcastRunEvents(auth.scope.workspaceId, id, parsed.events);

  // Everything in the batch is durable now — the ones this request inserted and
  // the ones a previous attempt already had. `storedThroughSeq` is therefore the
  // batch's own high-water mark and not the count of what changed; a pure replay
  // stores 0 rows and still advances the daemon's cursor, which is the point.
  const response: RunEventBatchResponse = {
    storedThroughSeq: storedThroughSeq(parsed.events),
    stored,
    duplicates: rows.length - stored,
  };

  return NextResponse.json(response);
}
