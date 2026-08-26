"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DAEMON_SETTABLE_KEYS, isRuntimeOnline } from "@sparstrow/shared";
import type { PairingCode, Runtime, RuntimeProject } from "@web/api/hooks";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";

/**
 * Code alphabet, chosen for being read aloud and retyped on another machine.
 * Moved verbatim from `POST /pairing-codes` (`handlers/runtimes.ts`).
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
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

/**
 * Moved verbatim from `POST /pairing-codes`. Member-level (`pairing_codes_own_insert`
 * RLS requires only workspace membership) — the caller's own supabase client
 * enforces this the same way it did as a route handler.
 */
export async function createPairingCodeAction(): Promise<ActionResult<PairingCode>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await ctx.supabase.from("pairing_codes").insert({
    code,
    workspace_id: ctx.workspaceId,
    created_by_user_id: user.id,
    expires_at: expiresAt,
  });
  if (error) return actionErrorFrom(error);

  return actionOk({ code, expiresAt });
}

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
 * Moved verbatim from `DELETE /runtimes/:id/token`. `daemon_tokens` carries
 * `daemon_tokens_admin_all` — RLS refuses this to a non-admin member by
 * matching zero rows, which is indistinguishable from (and reported the same
 * as) "no active pairing found" below. There is nothing this action adds on
 * top of the RLS boundary the route already relied on.
 */
export async function revokeRuntimeTokenAction(
  id: string,
): Promise<ActionResult<{ revoked: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("daemon_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("runtime_id", id)
    .eq("workspace_id", ctx.workspaceId)
    .is("revoked_at", null)
    .select("id");
  if (error) return actionErrorFrom(error);

  if (!data || data.length === 0) {
    return actionFail("No active pairing found for that machine.");
  }

  revalidatePath("/machines");
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
