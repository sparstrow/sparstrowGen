import { NextResponse } from "next/server";
import type { BindingReportRequest, ProjectBinding } from "@sparstrow/shared";
import { authenticateDaemon, daemonDb } from "@web/lib/daemon/auth";
import { authFailureResponse, daemonError, readJson } from "@web/lib/daemon/respond";

/**
 * "Here is what I actually have on disk."
 *
 * This is the route that makes enqueue-time project checking possible at all.
 * Until a machine reports its bindings, `runtime_projects` is empty and every
 * project looks unavailable everywhere — `start_run` would refuse every run
 * that names a project, and the failure would look like a dispatch bug rather
 * than a missing report.
 *
 * ─── A machine may not create board objects ─────────────────────────────────
 *
 * Bindings are matched to projects BY SLUG within the token's workspace, and a
 * slug with no matching project is skipped, not created. A daemon inventing
 * project rows would mean anyone who can pair a machine can write to the board,
 * and the whole containment argument for `/api/daemon/*` is that a machine can
 * only ever describe itself.
 *
 * Skipped slugs are returned so the daemon can log them once rather than
 * silently disagreeing with the cloud forever.
 */

const STATES = new Set<ProjectBinding["state"]>(["bound", "missing", "cloning", "error"]);

export async function POST(request: Request) {
  const auth = await authenticateDaemon(request);
  if (!auth.ok) return authFailureResponse(auth.failure);

  const body = (await readJson(request)) as BindingReportRequest | null;
  if (!body || !Array.isArray(body.bindings)) {
    return daemonError(400, "invalid_request", "bindings must be an array.");
  }

  const bindings = body.bindings.filter(
    (b): b is ProjectBinding =>
      !!b && typeof b.projectSlug === "string" && !!b.projectSlug && STATES.has(b.state),
  );

  const db = daemonDb();

  const { data: projects, error: lookupError } = await db
    .from("projects")
    .select("id, slug")
    .eq("workspace_id", auth.scope.workspaceId)
    .in(
      "slug",
      bindings.map((b) => b.projectSlug),
    );

  if (lookupError) {
    console.error("binding lookup failed", {
      runtimeId: auth.scope.runtimeId,
      message: lookupError.message,
    });
    return daemonError(500, "server_error", "Could not read the workspace's projects.");
  }

  const idBySlug = new Map((projects ?? []).map((p) => [p.slug as string, p.id as string]));
  const now = new Date().toISOString();

  const rows = bindings
    .filter((b) => idBySlug.has(b.projectSlug))
    .map((b) => ({
      workspace_id: auth.scope.workspaceId,
      runtime_id: auth.scope.runtimeId,
      project_id: idBySlug.get(b.projectSlug)!,
      local_path: b.localPath ?? null,
      state: b.state,
      detail: b.detail ?? null,
      last_seen: now,
      updated_at: now,
    }));

  if (rows.length > 0) {
    // Upsert on the composite primary key (runtime_id, project_id) — one
    // statement, so a machine with forty projects is one round trip rather than
    // forty, and a partial failure cannot leave half a report applied.
    const { error } = await db
      .from("runtime_projects")
      .upsert(rows, { onConflict: "runtime_id,project_id" });

    if (error) {
      console.error("binding report failed", {
        runtimeId: auth.scope.runtimeId,
        message: error.message,
      });
      return daemonError(500, "server_error", "Could not record the project bindings.");
    }
  }

  const unknown = bindings.filter((b) => !idBySlug.has(b.projectSlug)).map((b) => b.projectSlug);
  return NextResponse.json({ ok: true, recorded: rows.length, unknownSlugs: unknown });
}
