import { isRuntimeOnline } from "@sparstrow/shared";
import { registerRoute, ok, HandlerContext } from "../router";

/**
 * M3 — the browser's side of pairing.
 *
 * Ordinary session-cookie handlers: these run as the signed-in user, so RLS
 * does the work. `pairing_codes_own_insert` already requires
 * `created_by_user_id = auth.uid()` plus workspace membership, and
 * `runtimes_member_all` scopes the machine list.
 *
 * The writes that used to live here — `POST /pairing-codes`, renaming,
 * revoking, removing a runtime, the per-runtime settings switch, and the
 * four project-binding actions (relink/unbind/clone) — moved to
 * `app/machines/actions.ts` (`T-WA-08`). Reads stay here (plan DD-5).
 */

type RuntimeRow = {
  id: string;
  name: string;
  os: string;
  status: string;
  capabilities: unknown;
  last_heartbeat: string | null;
};

registerRoute({
  method: "GET",
  pattern: "/runtimes",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtimes")
      // `reported_settings` is what the Machines card's per-runtime snapshot
      // switch renders (M4 / G-6). Left out of this explicit list, the column
      // exists, the daemon writes it, and the switch silently shows its default
      // forever — a control that lies quietly, which is the exact failure G-6
      // was opened about. Found in the M4 browser pass.
      .select(
        "id, name, os, hostname, is_electron, capabilities, status, core_version, last_heartbeat, created_at, reported_settings",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const now = Date.now();
    // `online` is computed here, not read from `status`. A machine that
    // crashes writes nothing, so its stored status stays whatever it was when
    // it was last healthy. See doc/tasks/M3/README.md decision 4.
    return ok(
      (data ?? []).map((rt: RuntimeRow) => ({
        ...rt,
        online: isRuntimeOnline(rt.last_heartbeat, now),
      })),
    );
  }
});

/**
 * ─── M4: per-runtime project bindings ────────────────────────────────────────
 *
 * The read side of the four `project_not_available` actions
 * (`app/machines/actions.ts` now owns relink/unbind/clone).
 */

/**
 * Every project binding in the workspace.
 *
 * One request rather than one per runtime: the blocked-task affordance has to
 * answer "does any OTHER machine have this project?" before it can offer
 * reassign, and asking that per machine would be the N+1 this list exists to
 * avoid.
 */
registerRoute({
  method: "GET",
  pattern: "/runtime-projects",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase.from("runtime_projects").select("*").eq("workspace_id", workspaceId);

    const projectId = searchParams.get("projectId");
    const runtimeId = searchParams.get("runtimeId");
    if (projectId) query = query.eq("project_id", projectId);
    if (runtimeId) query = query.eq("runtime_id", runtimeId);

    const { data, error } = await query;
    if (error) throw error;
    return ok(data);
  }
});
