"use server";

import { revalidatePath } from "next/cache";
import type { Agent, AgentCreate, AgentUpdate } from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  toSnake,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";
import { slugify, withCollisionSuffix } from "@web/lib/slug";

const AGENTS_OPAQUE = ["mcp_servers", "specter_report"];

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Moved verbatim from the `POST /agents` handler this replaces, including
 * its slug-collision retry (`BUG-2026-08-22-team-create-500-missing-slug`):
 * `agents.slug` is `not null` with no DB default, and neither the client nor
 * this handler ever generated one before that fix.
 */
export async function createAgentAction(input: AgentCreate): Promise<ActionResult<Agent>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const id = generateId("agt_");
  const snake = toSnake(input) as Record<string, unknown>;
  const baseSlug =
    typeof snake.slug === "string" && snake.slug.trim() ? snake.slug : slugify((input.name as string) ?? "");
  const attempts = [baseSlug, withCollisionSuffix(baseSlug || "agent")];

  for (let i = 0; i < attempts.length; i++) {
    const payload = { ...snake, workspace_id: ctx.workspaceId, id, slug: attempts[i] };
    const { data, error } = await ctx.supabase.from("agents").insert(payload).select().single();
    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      return actionErrorFrom(error);
    }
    revalidatePath("/agents");
    return actionOk(toCamel(data, AGENTS_OPAQUE) as Agent);
  }

  // Unreachable: the second attempt's random suffix cannot collide twice.
  return actionFail("Internal Server Error");
}

/**
 * Moved verbatim from the `PATCH /agents/:id` handler this replaces.
 *
 * Fixes `BUG-2026-08-26-agent-update-always-404s` as a side effect: the
 * client hook this action replaces sent `PUT`, the handler only ever
 * registered `PATCH`, so every agent update 404'd. A Server Action has no
 * HTTP verb to mismatch.
 */
export async function updateAgentAction(id: string, data: AgentUpdate): Promise<ActionResult<Agent>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("agents")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/agents");
  return actionOk(toCamel(row, AGENTS_OPAQUE) as Agent);
}

/** Moved verbatim from the `DELETE /agents/:id` handler this replaces. */
export async function deleteAgentAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: deleted, error } = await ctx.supabase
    .from("agents")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/agents");
  return actionOk(undefined);
}

/** Moved verbatim from the `PUT /agents/:id/skills` handler this replaces. */
export async function setAgentSkillsAction(
  agentId: string,
  skillIds: string[],
): Promise<ActionResult<{ success: true }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { error: delError } = await ctx.supabase
    .from("agent_skills")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("agent_id", agentId);
  if (delError) return actionErrorFrom(delError);

  if (skillIds.length > 0) {
    const inserts = skillIds.map((skillId) => ({
      workspace_id: ctx.workspaceId,
      agent_id: agentId,
      skill_id: skillId,
    }));
    const { error: insError } = await ctx.supabase.from("agent_skills").insert(inserts);
    if (insError) return actionErrorFrom(insError);
  }

  revalidatePath("/agents");
  return actionOk({ success: true as const });
}
