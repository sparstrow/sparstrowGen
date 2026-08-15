import { NextResponse } from "next/server";
import type { MemoryPullResponse } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import {
  cursorFilter,
  nextCursorFrom,
  parsePullCursor,
  parsePullLimit,
  rowToPayload,
} from "@web/lib/daemon/memory-sync";
import { authFailureResponse, daemonError } from "@web/lib/daemon/respond";

/**
 * M6 — everything in this workspace that changed after the caller's cursor.
 *
 * Incremental by `(updated_at, id)`, ascending, one page at a time. The tuple
 * rather than a bare timestamp because two notes can be written in the same
 * millisecond and a `> updated_at` cursor would skip the second of them
 * forever. `idx_memory_notes_sync (workspace_id, updated_at)` — created in M1,
 * for exactly this — is what keeps the scan indexed.
 *
 * The workspace filter is the token's and there is no other. A daemon paired to
 * one workspace cannot name another, and a note it has never seen is simply not
 * in its result set.
 *
 * Note what is deliberately NOT filtered here: `last_writer_runtime_id`. A
 * machine does pull back notes it wrote itself, and that is correct — the
 * daemon's hash-equality check makes the ordinary case a free no-op, while the
 * one case that genuinely needs a re-pull (this machine's own local copy having
 * been deleted or corrupted outside the app) only works because the row is
 * still offered to it.
 */

export async function GET(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const params = new URL(request.url).searchParams;
  const cursor = parsePullCursor(params);
  const limit = parsePullLimit(params);

  const { data, error } = await daemonDb()
    .from("memory_notes")
    .select("*")
    .eq("workspace_id", auth.scope.workspaceId)
    .or(cursorFilter(cursor))
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("memory pull failed", {
      runtimeId: auth.scope.runtimeId,
      message: error.message,
    });
    return daemonError(500, "server_error", "Could not read the workspace's memory notes.");
  }

  const notes = (data ?? []).map(rowToPayload);

  const response: MemoryPullResponse = {
    // The server's own number, from the last row it actually returned — never
    // the caller's guess about where it got to. Same rule as
    // `storedThroughSeq`: a cursor advanced past a row that never arrived is a
    // permanent hole nobody can later discover.
    nextCursor: nextCursorFrom(notes, limit),
    notes,
  };

  return NextResponse.json(response);
}
