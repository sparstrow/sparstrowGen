"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DAEMON_SETTABLE_KEYS, isRuntimeOnline } from "@sparstrow/shared";
import type { Runtime, RuntimeProject } from "@web/api/hooks";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";

// Pairing a machine no longer starts from anything in this file — browser-
// loopback pairing (`/pair`, `apps/web/src/app/pair/actions.ts`) is initiated
// entirely by `sparstrow pair` on the machine itself. What used to live here
// as `createPairingCodeAction` is gone along with `pairing_codes`.

/**
 * Moved verbatim from `PATCH /runtimes/:id`. Only `name` — everything else is
 * self-reported by the daemon on every boot and would be silently
 * overwritten, which reads as the edit not saving.
 */
export async function renameRuntimeAction(
  id: string,
  name: string,
): Promise<ActionResult<Runtime>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const trimmed = name.trim();
  if (!trimmed) return actionFail("name is required");

  const { data, error } = await ctx.supabase
    .from("runtimes")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();
  if (error) return actionErrorFrom(error);
  if (!data) return actionFail("Not Found");

  revalidatePath("/machines");
  return actionOk(toCamel(data) as Runtime);
}

/**
 * Disconnect a machine from the caller's account entirely.
 *
 * What "revoke" means changed with the credential. A workspace-scoped token
 * could be revoked per workspace, because that is all it reached. A
 * person-scoped token reaches every workspace its owner is in, so revoking it
 * "for this workspace" would be a lie — the machine would carry on working
 * everywhere else while this page claimed it had been cut off.
 *
 * So this revokes the machine's credential outright, and the confirm copy in
 * the UI says so. Anything narrower would be a control that does not do what
 * its label promises.
 *
 * Scoped by `user_id` rather than by RLS alone: `access_tokens` is owner-only,
 * so a non-owner matches zero rows and gets the same "no active connection"
 * answer as a machine that was already disconnected — the two are genuinely
 * indistinguishable from here, and both mean "nothing to do".
 */
export async function revokeRuntimeTokenAction(
  id: string,
): Promise<ActionResult<{ revoked: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  // The runtime names a machine; the machine is what holds credentials. One
  // hop, and it is scoped to a workspace the caller can see, so a runtime id
  // from another workspace resolves to nothing.
  const { data: runtime } = await ctx.supabase
    .from("runtimes")
    .select("machine_id")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle<{ machine_id: string }>();

  if (!runtime?.machine_id) return actionFail("Not Found");

  const { data, error } = await ctx.supabase
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("machine_id", runtime.machine_id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id");
  if (error) return actionErrorFrom(error);

  if (!data || data.length === 0) {
    return actionFail("No active connection found for that computer.");
  }

  revalidatePath("/machines");
  revalidatePath("/settings");
  return actionOk({ revoked: data.length });
}

/** Moved verbatim from `DELETE /runtimes/:id`. Member-level, per `runtimes_member_all`. */
export async function removeRuntimeAction(id: string): Promise<ActionResult<{ deleted: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("runtimes")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!data || data.length === 0) return actionFail("Not Found");

  revalidatePath("/machines");
  return actionOk({ deleted: data.length });
}

/**
 * Moved verbatim from `PUT /runtimes/:id/settings` (`G-6`). Deliberately does
 * NOT echo the new value as if it were applied — the Machines card renders
 * `reportedSettings`, which only the daemon writes, and an optimistic switch
 * would have exactly `G-6`'s defect wearing a better hat.
 */
export async function setRuntimeSettingAction(
  runtimeId: string,
  key: string,
  value: string,
): Promise<ActionResult<{ queued: boolean }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  if (!DAEMON_SETTABLE_KEYS.includes(key)) {
    return actionFail(`"${key}" cannot be set remotely.`, "setting_not_allowed");
  }

  const { data: runtime, error: runtimeError } = await ctx.supabase
    .from("runtimes")
    .select("id, name, last_heartbeat")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", runtimeId)
    .maybeSingle();
  if (runtimeError) return actionErrorFrom(runtimeError);
  if (!runtime) return actionFail("Not Found");
  if (!isRuntimeOnline(runtime.last_heartbeat)) {
    return actionFail(`${runtime.name} is offline.`, "runtime_offline");
  }

  const { error } = await ctx.supabase.from("runtime_commands").insert({
    id: `cmd_${randomBytes(8).toString("hex")}`,
    workspace_id: ctx.workspaceId,
    runtime_id: runtimeId,
    kind: "settings.set",
    payload: { key, value },
    status: "pending",
    // Includes the value, so flipping a switch off and straight back on is
    // two commands rather than one silently-swallowed duplicate.
    idempotency_key: `settings.set:${runtimeId}:${key}:${value}`,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") return actionOk({ queued: true });
    return actionErrorFrom(error);
  }

  return actionOk({ queued: true });
}

/** Relink: the project is on that machine, just not where the binding says. Moved
 *  verbatim from `PUT /runtimes/:id/projects/:projectId`. */
export async function relinkProjectAction(
  runtimeId: string,
  projectId: string,
  localPath: string,
): Promise<ActionResult<RuntimeProject>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const trimmed = localPath.trim();
  if (!trimmed) return actionFail("A path on that machine is required.", "invalid_request");

  const { data, error } = await ctx.supabase
    .from("runtime_projects")
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        runtime_id: runtimeId,
        project_id: projectId,
        local_path: trimmed,
        state: "bound",
        detail: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "runtime_id,project_id" },
    )
    .select("*");

  if (error) return actionErrorFrom(error);
  if (!data || data.length === 0) return actionFail("Not Found");

  revalidatePath("/machines");
  return actionOk(toCamel(data[0]) as RuntimeProject);
}

/** Unbind: this machine should stop being considered for this project. Moved
 *  verbatim from `DELETE /runtimes/:id/projects/:projectId`. */
export async function unbindProjectAction(
  runtimeId: string,
  projectId: string,
): Promise<ActionResult<{ unbound: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("runtime_projects")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("runtime_id", runtimeId)
    .eq("project_id", projectId)
    .select("project_id");

  if (error) return actionErrorFrom(error);
  if (!data || data.length === 0) return actionFail("Not Found");

  revalidatePath("/machines");
  return actionOk({ unbound: data.length });
}

/** Clone: fetch the bytes onto that machine from the project's git remote. Moved
 *  verbatim from `POST /runtimes/:id/projects/:projectId/clone`. */
export async function cloneProjectAction(
  runtimeId: string,
  projectId: string,
  localPath: string,
): Promise<ActionResult<{ queued: boolean }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const trimmed = localPath.trim();
  if (!trimmed) {
    return actionFail("A destination path on that machine is required.", "invalid_request");
  }

  const { data: project, error: projectError } = await ctx.supabase
    .from("projects")
    .select("id, slug, git_remote")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return actionErrorFrom(projectError);
  if (!project) return actionFail("Not Found");
  if (!project.git_remote) {
    return actionFail(
      "That project has no git remote to clone from. Relink it to a copy you already have instead.",
      "no_git_remote",
    );
  }

  const { data: runtime, error: runtimeError } = await ctx.supabase
    .from("runtimes")
    .select("id, name, last_heartbeat")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", runtimeId)
    .maybeSingle();
  if (runtimeError) return actionErrorFrom(runtimeError);
  if (!runtime) return actionFail("Not Found");
  if (!isRuntimeOnline(runtime.last_heartbeat)) {
    return actionFail(`${runtime.name} is offline.`, "runtime_offline");
  }

  const { error } = await ctx.supabase.from("runtime_commands").insert({
    id: `cmd_${randomBytes(8).toString("hex")}`,
    workspace_id: ctx.workspaceId,
    runtime_id: runtimeId,
    kind: "project.clone",
    payload: {
      projectId: project.id,
      projectSlug: project.slug,
      gitRemote: project.git_remote,
      localPath: trimmed,
    },
    status: "pending",
    idempotency_key: `project.clone:${runtimeId}:${projectId}:${trimmed}`,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") return actionOk({ queued: true });
    return actionErrorFrom(error);
  }

  return actionOk({ queued: true });
}
