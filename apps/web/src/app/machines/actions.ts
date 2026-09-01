"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DAEMON_SETTABLE_KEYS, isRuntimeOnline } from "@sparstrow/shared";
import type { Runtime, RuntimeProject, RuntimeUsage, RuntimeActivityRun, AgentMachineRestriction } from "@web/api/hooks";
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

/**
 * What removing this machine would also clear, shown before the confirm
 * dialog is opened rather than discovered after — `agent_machine_restrictions`
 * cascades on `runtime_id` (`ON DELETE CASCADE`), so those rows vanish
 * silently otherwise. Read-only; does not remove anything itself.
 */
export async function getRuntimeRemovalImpactAction(
  id: string,
): Promise<ActionResult<{ agentRestrictions: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { count, error } = await ctx.supabase
    .from("agent_machine_restrictions")
    .select("id", { count: "exact", head: true })
    .eq("runtime_id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return actionErrorFrom(error);

  return actionOk({ agentRestrictions: count ?? 0 });
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

// ─── Usage & activity (Machines profile, Activity tab) ─────────────────────
//
// No new table backs either of these — `runs.target_runtime_id` (indexed,
// `idx_runs_runtime`) already carries everything a per-machine cost/activity
// view needs. Cost is summed in JS after the select rather than via a
// PostgREST aggregate, matching the one other cost rollup in this codebase
// (`packages/core/src/memory/dream-cycle.ts`'s `dreamSpendLast24h()`) —
// same reasoning: simple, and the row count this sums over is bounded by
// `RUNS_WINDOW_LIMIT` below, not by the whole table.
const RUNS_WINDOW_LIMIT = 500;

/** Recent runs targeting this machine, newest first — the Activity tab's
 *  real data. `agentName` is joined in a second query rather than a
 *  PostgREST embed, so a deleted agent (no FK enforced on `runs.agent_id`,
 *  see schema.ts) degrades to "Unknown agent" instead of dropping the run. */
export async function getRuntimeActivityAction(
  runtimeId: string,
  limit = 20,
): Promise<ActionResult<RuntimeActivityRun[]>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: runs, error } = await ctx.supabase
    .from("runs")
    .select("id, agent_id, status, cost_usd, duration_ms, started_at, finished_at, created_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("target_runtime_id", runtimeId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, RUNS_WINDOW_LIMIT));
  if (error) return actionErrorFrom(error);
  if (!runs || runs.length === 0) return actionOk([]);

  const agentIds = [...new Set(runs.map((r) => r.agent_id as string))];
  const { data: agents, error: agentsError } = await ctx.supabase
    .from("agents")
    .select("id, name")
    .eq("workspace_id", ctx.workspaceId)
    .in("id", agentIds);
  if (agentsError) return actionErrorFrom(agentsError);

  const nameById = new Map((agents ?? []).map((a) => [a.id as string, a.name as string]));
  return actionOk(
    runs.map((r) => ({
      ...(toCamel(r) as Omit<RuntimeActivityRun, "agentName">),
      agentName: nameById.get(r.agent_id as string) ?? "Unknown agent",
    })),
  );
}

/** Month-to-date cost + a lightweight recent-run summary for this machine,
 *  plus the optional budget a workspace member set on it. */
export async function getRuntimeUsageAction(runtimeId: string): Promise<ActionResult<RuntimeUsage>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: runtime, error: runtimeError } = await ctx.supabase
    .from("runtimes")
    .select("monthly_cost_budget_usd")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", runtimeId)
    .maybeSingle();
  if (runtimeError) return actionErrorFrom(runtimeError);
  if (!runtime) return actionFail("Not Found");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: runs, error: runsError } = await ctx.supabase
    .from("runs")
    .select("cost_usd, duration_ms")
    .eq("workspace_id", ctx.workspaceId)
    .eq("target_runtime_id", runtimeId)
    .gte("created_at", monthStart.toISOString())
    .limit(RUNS_WINDOW_LIMIT);
  if (runsError) return actionErrorFrom(runsError);

  const rows = runs ?? [];
  const monthToDateCostUsd = rows.reduce((sum, r) => sum + ((r.cost_usd as number | null) ?? 0), 0);
  const durations = rows.map((r) => r.duration_ms as number | null).filter((d): d is number => d != null);
  const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  return actionOk({
    monthToDateCostUsd,
    runCountThisMonth: rows.length,
    avgDurationMs,
    budgetUsd: (runtime.monthly_cost_budget_usd as number | null) ?? null,
    // `RUNS_WINDOW_LIMIT` truncation surfaces here rather than silently — a
    // month with more than 500 runs shows a real (undercounted) total plus
    // this flag, not a wrong number that looks exact.
    truncated: rows.length >= RUNS_WINDOW_LIMIT,
  });
}

/** Sets or clears this machine's optional monthly cost budget. `null` clears
 *  it. Purely a display threshold — nothing reads this to block a run. */
export async function setRuntimeCostBudgetAction(
  runtimeId: string,
  budgetUsd: number | null,
): Promise<ActionResult<{ budgetUsd: number | null }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  if (budgetUsd !== null && (!Number.isFinite(budgetUsd) || budgetUsd < 0)) {
    return actionFail("Budget must be a positive number, or blank to clear it.", "invalid_budget");
  }

  const { error } = await ctx.supabase
    .from("runtimes")
    .update({ monthly_cost_budget_usd: budgetUsd })
    .eq("id", runtimeId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return actionErrorFrom(error);

  revalidatePath("/machines");
  return actionOk({ budgetUsd });
}

// ─── Agent-machine restrictions (Machines profile, Providers/Settings) ─────
//
// `agent_machine_restrictions` already exists (M18/`access_model`) and is
// enforced elsewhere (`tool-policy.ts`); nothing here changes what it does,
// only surfaces it on the machine side of the relationship instead of only
// the agent side. FR-009: no rows for an agent means it may run anywhere —
// removing the last restriction row for an agent does not need special
// handling, it is simply the empty-list case.

/** Every agent currently restricted to this machine. */
export async function getRuntimeAgentRestrictionsAction(
  runtimeId: string,
): Promise<ActionResult<AgentMachineRestriction[]>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: rows, error } = await ctx.supabase
    .from("agent_machine_restrictions")
    .select("id, agent_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("runtime_id", runtimeId);
  if (error) return actionErrorFrom(error);
  if (!rows || rows.length === 0) return actionOk([]);

  const agentIds = [...new Set(rows.map((r) => r.agent_id as string))];
  const { data: agents, error: agentsError } = await ctx.supabase
    .from("agents")
    .select("id, name")
    .eq("workspace_id", ctx.workspaceId)
    .in("id", agentIds);
  if (agentsError) return actionErrorFrom(agentsError);

  const nameById = new Map((agents ?? []).map((a) => [a.id as string, a.name as string]));
  return actionOk(
    rows.map((r) => ({
      id: r.id as string,
      agentId: r.agent_id as string,
      agentName: nameById.get(r.agent_id as string) ?? "Unknown agent",
    })),
  );
}

/** Restrict an agent to this machine (it may only run here, not elsewhere). */
export async function addAgentMachineRestrictionAction(
  agentId: string,
  runtimeId: string,
): Promise<ActionResult<AgentMachineRestriction>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: agent, error: agentError } = await ctx.supabase
    .from("agents")
    .select("id, name")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", agentId)
    .maybeSingle();
  if (agentError) return actionErrorFrom(agentError);
  if (!agent) return actionFail("Not Found");

  const { data, error } = await ctx.supabase
    .from("agent_machine_restrictions")
    .insert({
      id: `amr_${randomBytes(8).toString("hex")}`,
      workspace_id: ctx.workspaceId,
      agent_id: agentId,
      runtime_id: runtimeId,
    })
    .select("id")
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/machines");
  return actionOk({ id: data.id as string, agentId, agentName: agent.name as string });
}

/** Lifts a restriction — the agent may run elsewhere again (and still may run
 *  here too; this table is an allow-list of *where*, not a deny-list). */
export async function removeAgentMachineRestrictionAction(
  id: string,
): Promise<ActionResult<{ removed: number }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("agent_machine_restrictions")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!data || data.length === 0) return actionFail("Not Found");

  revalidatePath("/machines");
  return actionOk({ removed: data.length });
}
