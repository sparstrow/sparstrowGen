import { randomBytes } from "node:crypto";
import { DAEMON_SETTABLE_KEYS, isRuntimeOnline } from "@sparstrow/shared";
import { registerRoute, ok, fail, HandlerContext } from "../router";

/**
 * M3 — the browser's side of pairing.
 *
 * Ordinary session-cookie handlers, unlike `/api/daemon/*`: these run as the
 * signed-in user, so RLS does the work. `pairing_codes_own_insert` already
 * requires `created_by_user_id = auth.uid()` plus workspace membership, and
 * `runtimes_member_all` scopes the machine list.
 */

/**
 * Code alphabet, chosen for being read aloud and retyped on another machine.
 *
 * No 0/O, no 1/I/L — the confusable pairs someone will get wrong when copying
 * a code from a laptop screen to a desktop terminal. Excluding them costs
 * entropy per character, so length makes it back: 10 characters of this
 * 30-symbol alphabet is ~49 bits, and codes die after 10 minutes and one use.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  // rejection-free: 31 symbols does not divide 256 evenly, so a naive modulo
  // biases toward early characters. Draw a byte per character and reject the
  // tail rather than skewing the distribution of a credential.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

registerRoute({
  method: "POST",
  pattern: "/pairing-codes",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error } = await supabase.from("pairing_codes").insert({
      code,
      workspace_id: workspaceId,
      created_by_user_id: user.id,
      expires_at: expiresAt,
    });
    if (error) throw error;

    // Returned once, to the person who asked for it. Nothing reads a pairing
    // code back out afterwards — the list endpoint below deliberately has no
    // way to recover one.
    return ok({ code, expiresAt });
  },
});

registerRoute({
  method: "GET",
  pattern: "/runtimes",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtimes")
      .select("id, name, os, hostname, is_electron, capabilities, status, core_version, last_heartbeat, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const now = Date.now();
    // `online` is computed here, not read from `status`. A machine that
    // crashes writes nothing, so its stored status stays whatever it was when
    // it was last healthy. See doc/tasks/M3/README.md decision 4.
    return ok(
      (data ?? []).map((rt) => ({
        ...rt,
        online: isRuntimeOnline(rt.last_heartbeat as string | null, now),
      })),
    );
  },
});

registerRoute({
  method: "PATCH",
  pattern: "/runtimes/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return fail(400, "name is required");

    // Only `name`. Everything else on a runtime is self-reported by the daemon
    // on every boot, so a value written here would be silently overwritten the
    // next time that machine restarts — which looks like the edit not saving.
    const { data, error } = await supabase
      .from("runtimes")
      .update({ name })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});

registerRoute({
  method: "DELETE",
  pattern: "/runtimes/:id/token",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // Revoke, not delete: the history of which machine was paired when is
    // worth keeping, the daemon API checks `revoked_at` on every request so
    // this takes effect immediately, and deleting the row would orphan the
    // runtime it points at.
    const { data, error } = await supabase
      .from("daemon_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("runtime_id", params.id)
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw error;

    // `.select()` after the update is what makes a no-op distinguishable. A
    // filtered update against another workspace's runtime affects zero rows
    // and would otherwise report success -- the same false-204 bug M2 found
    // across eleven DELETE handlers.
    if (!data || data.length === 0) {
      return fail(404, "No active pairing found for that machine.");
    }
    return ok({ revoked: data.length });
  },
});

registerRoute({
  method: "DELETE",
  pattern: "/runtimes/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtimes")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return fail(404, "Not Found");
    return ok({ deleted: data.length });
  },
});

/**
 * ─── M4: per-runtime project bindings and settings ──────────────────────────
 *
 * These are the server side of the four `project_not_available` actions and of
 * the per-runtime WIP snapshot toggle (`G-6`).
 *
 * Session-cookie handlers with RLS as the backstop, like everything else in
 * this file. `runtime_projects` and `runtimes` both carry `*_member_all`
 * policies, so a caller cannot reach another workspace's rows even though the
 * ids arrive in the path — but every query still filters on `workspaceId`,
 * because defence that costs one line is not worth omitting.
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
  },
});

/** Relink: the project is here, just not where the binding says. */
registerRoute({
  method: "PUT",
  pattern: "/runtimes/:id/projects/:projectId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const localPath = typeof body?.localPath === "string" ? body.localPath.trim() : "";
    if (!localPath) return fail(400, "A path on that machine is required.", "invalid_request");

    // The browser cannot check that this path exists — it is on someone else's
    // disk. That is expected: the row reads `bound` optimistically and the
    // daemon's next binding report corrects it to `missing` if it is wrong.
    // Refusing to accept a path we cannot verify would make relink impossible.
    const { data, error } = await supabase
      .from("runtime_projects")
      .upsert(
        {
          workspace_id: workspaceId,
          runtime_id: params.id,
          project_id: params.projectId,
          local_path: localPath,
          state: "bound",
          detail: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "runtime_id,project_id" },
      )
      .select("*");

    if (error) throw error;
    if (!data || data.length === 0) return fail(404, "Not Found");
    return ok(data[0]);
  },
});

/** Unbind: this machine should stop being considered for this project. */
registerRoute({
  method: "DELETE",
  pattern: "/runtimes/:id/projects/:projectId",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtime_projects")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("runtime_id", params.id)
      .eq("project_id", params.projectId)
      .select("project_id");

    if (error) throw error;
    // M2's lesson: a delete that affected nothing reported success. Check.
    if (!data || data.length === 0) return fail(404, "Not Found");
    return ok({ unbound: data.length });
  },
});

/** Clone: fetch the bytes onto that machine from the project's git remote. */
registerRoute({
  method: "POST",
  pattern: "/runtimes/:id/projects/:projectId/clone",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const localPath = typeof body?.localPath === "string" ? body.localPath.trim() : "";
    if (!localPath) {
      return fail(400, "A destination path on that machine is required.", "invalid_request");
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, slug, git_remote")
      .eq("workspace_id", workspaceId)
      .eq("id", params.projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return fail(404, "Not Found");
    if (!project.git_remote) {
      return fail(
        409,
        "That project has no git remote to clone from. Relink it to a copy you already have instead.",
        "no_git_remote",
      );
    }

    const { data: runtime, error: runtimeError } = await supabase
      .from("runtimes")
      .select("id, name, last_heartbeat")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .maybeSingle();

    if (runtimeError) throw runtimeError;
    if (!runtime) return fail(404, "Not Found");
    if (!isRuntimeOnline(runtime.last_heartbeat)) {
      // A command for an offline machine would sit pending until it came back,
      // which reads as a clone that silently never happened.
      return fail(409, `${runtime.name} is offline.`, "runtime_offline");
    }

    const { error } = await supabase.from("runtime_commands").insert({
      id: `cmd_${randomBytes(8).toString("hex")}`,
      workspace_id: workspaceId,
      runtime_id: params.id,
      kind: "project.clone",
      payload: {
        projectId: project.id,
        projectSlug: project.slug,
        gitRemote: project.git_remote,
        localPath,
      },
      status: "pending",
      // Keyed on the destination, so double-clicking Clone enqueues one clone.
      // Not on the project alone: cloning the same project to a second path on
      // the same machine is a legitimate thing to ask for later.
      idempotency_key: `project.clone:${params.id}:${params.projectId}:${localPath}`,
    });

    if (error) {
      // 23505 is the idempotency key: the clone is already queued.
      if ((error as { code?: string }).code === "23505") return ok({ queued: true });
      throw error;
    }

    return ok({ queued: true });
  },
});

/** The per-runtime WIP snapshot control (`G-6`). */
registerRoute({
  method: "PUT",
  pattern: "/runtimes/:id/settings",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const key = typeof body?.key === "string" ? body.key : "";
    const value = body?.value === undefined || body?.value === null ? "" : String(body.value);

    // The allowlist that matters is the daemon's; this one exists so a rejected
    // key fails here, immediately and legibly, instead of travelling to a
    // machine to be refused there a few seconds later.
    if (!DAEMON_SETTABLE_KEYS.includes(key)) {
      return fail(400, `"${key}" cannot be set remotely.`, "setting_not_allowed");
    }

    const { data: runtime, error: runtimeError } = await supabase
      .from("runtimes")
      .select("id, name, last_heartbeat")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .maybeSingle();

    if (runtimeError) throw runtimeError;
    if (!runtime) return fail(404, "Not Found");
    if (!isRuntimeOnline(runtime.last_heartbeat)) {
      return fail(409, `${runtime.name} is offline.`, "runtime_offline");
    }

    const { error } = await supabase.from("runtime_commands").insert({
      id: `cmd_${randomBytes(8).toString("hex")}`,
      workspace_id: workspaceId,
      runtime_id: params.id,
      kind: "settings.set",
      payload: { key, value },
      status: "pending",
      // Includes the value, so flipping a switch off and straight back on is
      // two commands rather than one silently-swallowed duplicate. A timestamp
      // would work too, but this keeps a repeated identical request idempotent.
      idempotency_key: `settings.set:${params.id}:${key}:${value}`,
    });

    if (error) {
      if ((error as { code?: string }).code === "23505") return ok({ queued: true });
      throw error;
    }

    // Deliberately does NOT echo the new value as if it were applied. The
    // Machines card reads `reported_settings`, which only the daemon writes.
    return ok({ queued: true });
  },
});
