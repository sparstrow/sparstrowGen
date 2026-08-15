import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  isRuntimeOnline,
  type MemoryNoteSyncPayload,
  type MemoryPushResponse,
  type MemoryPushResult,
} from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import {
  decidePush,
  parsePushBatch,
  rowToPayload,
  toCloudRow,
} from "@web/lib/daemon/memory-sync";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * M6 — a machine offering its memory notes to the workspace.
 *
 * Per-note last-write-wins, decided in `memory-sync.ts` and reported per note:
 * some notes in one batch can win while others lose, and that is a normal
 * outcome, not a partial failure. The only whole-batch rejections are auth and
 * a malformed body.
 *
 * ─── Why this route may create rows, unlike `projects/bindings` ─────────────
 *
 * The binding route's containment rule is that a machine may describe itself
 * but never invent board identity — an unmatched project slug is skipped, not
 * created. Memory notes are deliberately the opposite: a note is content this
 * machine legitimately authored, not a reference to a shared board object with
 * its own lifecycle, so the first push of a new note is EXPECTED to insert.
 *
 * What does not change is where the workspace comes from. It is the token's,
 * on every write, exactly as everywhere else under `/api/daemon/*`. This
 * handler holds the service role; RLS will not catch a mistake here.
 */

/** Ids the caller sent that belong to some OTHER workspace's note. */
type ForeignIds = Set<string>;

export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const parsed = parsePushBatch(await readJson(request));
  if (!parsed.ok) return daemonError(400, "invalid_request", parsed.detail);

  const db = daemonDb();
  const { workspaceId, runtimeId } = auth.scope;
  const ids = parsed.notes.map((n) => n.id);

  // Looked up by id ACROSS workspaces, then filtered in code — not with
  // `.eq("workspace_id", …)` in the query.
  //
  // This is the sharp edge of the whole route. `memory_notes.id` is the primary
  // key GLOBALLY, so the upsert below conflicts on id alone. Scope the lookup to
  // this workspace and a note id belonging to another workspace comes back
  // absent, is judged "insert", and the upsert then rewrites that row —
  // including its `workspace_id`. A daemon in workspace A could overwrite
  // workspace B's note by guessing one id.
  //
  // Reading every matching id regardless of workspace is what makes that
  // detectable at all. Ids are `mem_` + nanoid(10), so a genuine collision is
  // not a thing that happens; anything found here is either this workspace's
  // note or an attempt.
  const { data: existingRows, error: lookupError } = await db
    .from("memory_notes")
    .select("id, workspace_id, content_hash, updated_at")
    .in("id", ids);

  if (lookupError) {
    console.error("memory push lookup failed", { runtimeId, message: lookupError.message });
    return daemonError(500, "server_error", "Could not read the workspace's memory notes.");
  }

  const mine = new Map<string, { contentHash: string; updatedAt: string }>();
  const foreign: ForeignIds = new Set();
  for (const row of existingRows ?? []) {
    if ((row.workspace_id as string) !== workspaceId) {
      foreign.add(row.id as string);
      continue;
    }
    mine.set(row.id as string, {
      contentHash: (row.content_hash as string | null) ?? "",
      updatedAt: (row.updated_at as string | null) ?? "",
    });
  }

  if (foreign.size > 0) {
    // Loud, because there is no benign explanation. Ids only, never content.
    console.error("memory push named notes from another workspace — refused", {
      runtimeId,
      workspaceId,
      ids: [...foreign],
    });
  }

  const toWrite: Array<Record<string, unknown>> = [];
  const losers: string[] = [];
  const results: MemoryPushResult[] = [];

  for (const note of parsed.notes) {
    if (foreign.has(note.id)) {
      // No `current`: that row is another workspace's content and returning it
      // would turn a refusal into a read primitive.
      results.push({ id: note.id, applied: false });
      continue;
    }

    const verdict = decidePush(note, mine.get(note.id) ?? null);
    if (verdict === "insert" || verdict === "update") {
      toWrite.push(toCloudRow(workspaceId, runtimeId, note));
      results.push({ id: note.id, applied: true });
    } else if (verdict === "noop") {
      // The cloud already holds exactly this content. `applied: true` because
      // the daemon's version IS what the cloud has, which is what the flag
      // means — it is not a rejection.
      results.push({ id: note.id, applied: true });
    } else {
      losers.push(note.id);
      // `current` is filled in below, after one round trip for all of them
      // rather than one each.
      results.push({ id: note.id, applied: false });
    }
  }

  let stored = 0;
  if (toWrite.length > 0) {
    const failed = await writeNotes(db, toWrite, runtimeId);
    if (failed === null) {
      return daemonError(500, "server_error", "Could not record the memory notes.");
    }
    stored = toWrite.length - failed.size;
    // A note that could not be stored must not be reported as applied — the
    // daemon would set `syncedHash` for content the cloud never took and stop
    // ever retrying it.
    if (failed.size > 0) {
      for (const result of results) {
        if (failed.has(result.id)) result.applied = false;
      }
    }
  }

  if (losers.length > 0) {
    const { data: winners, error: winnerError } = await db
      .from("memory_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("id", losers);

    if (winnerError) {
      // Not fatal: the daemon learns it lost, just without the winning content
      // in hand. Its next pull sweep fetches it anyway.
      console.error("memory push could not read winning rows", {
        runtimeId,
        message: winnerError.message,
      });
    } else {
      const byId = new Map<string, MemoryNoteSyncPayload>(
        (winners ?? []).map((row) => [row.id as string, rowToPayload(row)]),
      );
      for (const result of results) {
        if (!result.applied) {
          const current = byId.get(result.id);
          if (current) result.current = current;
        }
      }
    }
  }

  // The doorbell, and only after a row genuinely landed. A push that was
  // entirely no-ops — or whose every write was rejected — has nothing for
  // anyone to pull, and waking every machine in the workspace to discover that
  // is pure noise.
  if (stored > 0) {
    await notifyOtherRuntimes(db, workspaceId, runtimeId);
  }

  const response: MemoryPushResponse = { results };
  return NextResponse.json(response);
}

/**
 * Store the batch, and do not let one bad note take the rest down with it.
 *
 * The fast path is a single upsert. The failure it has to survive is a UNIQUE
 * violation on `uq_memory_notes_workspace_path` — two machines that
 * independently created a note at the same vault path, which is unlikely (paths
 * carry a random suffix) but not impossible, and would otherwise wedge this
 * daemon permanently: the whole batch 500s, every note in it stays dirty, the
 * next sweep rebuilds the same batch, and the same one note fails it again
 * forever. One note nobody can sync is a bug; every note on a machine unable to
 * sync because of it is an outage.
 *
 * So a constraint violation falls back to one upsert per note, and the ids that
 * genuinely could not be stored come back to be reported `applied: false`.
 *
 * Returns null when the failure was not per-row (a dead connection, a bad
 * credential) — that IS a 500, because retrying is exactly right for it.
 */
async function writeNotes(
  db: ReturnType<typeof daemonDb>,
  rows: Array<Record<string, unknown>>,
  runtimeId: string,
): Promise<Set<string> | null> {
  const { error } = await db.from("memory_notes").upsert(rows, { onConflict: "id" });
  if (!error) return new Set();

  // The notes themselves are NEVER logged — a note body is the user's own
  // writing. Ids and a count are enough to find anything worth finding.
  console.error("memory push upsert failed", {
    runtimeId,
    count: rows.length,
    code: (error as { code?: string }).code,
    message: error.message,
  });

  // 23505 unique_violation, 23514 check_violation: the row itself is the
  // problem. Anything else is the connection or the credential.
  const code = (error as { code?: string }).code;
  if (code !== "23505" && code !== "23514") return null;

  const failed = new Set<string>();
  for (const row of rows) {
    const { error: rowError } = await db.from("memory_notes").upsert([row], { onConflict: "id" });
    if (rowError) failed.add(row.id as string);
  }

  console.error("memory push stored the batch note-by-note after a constraint violation", {
    runtimeId,
    stored: rows.length - failed.size,
    rejected: [...failed],
  });
  return failed;
}

/**
 * Enqueue `memory.sync` for every OTHER machine in this workspace that is
 * currently online.
 *
 * Online is derived from `last_heartbeat` via `isRuntimeOnline`, never read
 * from `runtimes.status` — a machine that dies writes nothing, so a stored
 * `online` stays `online` forever. Same rule as M3 decision 4.
 *
 * Offline machines are deliberately skipped rather than queued for: their
 * command would sit until the attempts ceiling expired it, and the pull sweep
 * is what actually guarantees delivery to a machine that was away. The doorbell
 * is an optimisation; the sweep is the guarantee.
 *
 * Failures here are logged and swallowed. The push itself has already
 * committed, and turning "could not ring the doorbell" into a 500 would make
 * the daemon retry a push whose rows already landed.
 */
async function notifyOtherRuntimes(
  db: ReturnType<typeof daemonDb>,
  workspaceId: string,
  pusherRuntimeId: string,
): Promise<void> {
  try {
    const { data: runtimes, error } = await db
      .from("runtimes")
      .select("id, last_heartbeat")
      .eq("workspace_id", workspaceId)
      .neq("id", pusherRuntimeId);

    if (error) throw error;

    const online = (runtimes ?? []).filter((r) => isRuntimeOnline(r.last_heartbeat as string | null));
    if (online.length === 0) return;

    // One pending doorbell per machine is enough — it is a wake-up carrying no
    // payload, so a second one queued behind the first would tell that machine
    // exactly what the first already did. Checked rather than enforced by a
    // fixed idempotency key, because the key is UNIQUE across all time: a
    // constant one would enqueue the first `memory.sync` a machine ever gets
    // and then silently never enqueue another.
    const { data: pending, error: pendingError } = await db
      .from("runtime_commands")
      .select("runtime_id")
      .eq("workspace_id", workspaceId)
      .eq("kind", "memory.sync")
      .in("status", ["pending", "claimed"])
      .in(
        "runtime_id",
        online.map((r) => r.id as string),
      );

    if (pendingError) throw pendingError;

    const alreadyWaiting = new Set((pending ?? []).map((c) => c.runtime_id as string));
    const rows = online
      .filter((r) => !alreadyWaiting.has(r.id as string))
      .map((r) => ({
        id: `cmd_${randomBytes(8).toString("hex")}`,
        workspace_id: workspaceId,
        runtime_id: r.id as string,
        kind: "memory.sync",
        payload: {},
        status: "pending",
        // Unique per command rather than per machine. Two concurrent pushes can
        // both pass the pending check above and both insert; the cost is one
        // redundant wake-up that finds nothing to pull and acks `done`, which
        // is a normal outcome for this command by design.
        idempotency_key: `memory.sync:${r.id as string}:${randomBytes(8).toString("hex")}`,
      }));

    if (rows.length === 0) return;

    const { error: insertError } = await db.from("runtime_commands").insert(rows);
    if (insertError) throw insertError;
  } catch (err) {
    console.error("could not enqueue memory.sync commands", {
      workspaceId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
