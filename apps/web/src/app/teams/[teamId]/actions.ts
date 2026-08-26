"use server";

import { revalidatePath } from "next/cache";
import type { Team, TeamMember } from "@sparstrow/shared";
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

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * T-WA-01, second half.
 *
 * `/teams` is a Server Component (`T-VR-05`), so its actions finish the job
 * with `revalidatePath` alone. **This route is not**: `page.tsx` is
 * `"use client"` and `team-detail.tsx` reads through `useTeam()`, so
 * `revalidatePath` cannot reach the data on screen -- it invalidates Next's
 * route cache, and this page's data lives in a React Query cache in the
 * browser.
 *
 * So the caller keeps its `invalidateQueries` call after awaiting the action.
 * That is plan DD-1's intermediate state, and it is deliberate: what `OQ-7`
 * option B preserved was POSTing to `/api/v1`, which is gone here. What
 * remains is a client cache invalidation, which disappears when this route's
 * READ converts in WA2.
 *
 * Both `revalidatePath` calls are still issued below, because `/teams`'s
 * member and project counts ARE server-rendered and do go stale otherwise.
 *
 * Plan: doc/plans/2026-08-24-server-action-write-conversion.md
 */

export async function updateTeamAction(input: {
  id: string;
  data: { name?: string; description?: string };
}): Promise<ActionResult<Team>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("teams")
    .update(toSnake(input.data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/teams");
  revalidatePath(`/teams/${input.id}`);
  return actionOk(toCamel(data) as Team);
}

export async function deleteTeamAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  // `.select()` makes PostgREST return the deleted rows. Without it a delete
  // that matched nothing -- because the id is unknown OR because RLS hid
  // another workspace's row -- still resolves without error, and this would
  // report success. The client then drops a row it never actually deleted.
  const { data: deleted, error } = await ctx.supabase
    .from("teams")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/teams");
  // Deliberately no `redirect()` here. A Next.js redirect inside a Server
  // Action throws a control-flow exception, which any try/catch built around
  // an ActionResult would swallow -- the navigation would silently never
  // happen. The caller navigates on `ok: true` instead.
  return actionOk(undefined);
}

export async function addTeamMemberAction(input: {
  teamId: string;
  data: { agentId: string; teamRole: string | null };
}): Promise<ActionResult<TeamMember>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(input.data),
    workspace_id: ctx.workspaceId,
    team_id: input.teamId,
    id: generateId("tmb_"),
  };
  const { data, error } = await ctx.supabase
    .from("team_members")
    .insert(payload)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/teams");
  revalidatePath(`/teams/${input.teamId}`);
  return actionOk(toCamel(data) as TeamMember);
}

export async function updateTeamMemberAction(input: {
  teamId: string;
  memberId: string;
  data: { teamRole: string | null };
}): Promise<ActionResult<TeamMember>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("team_members")
    .update(toSnake(input.data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("team_id", input.teamId)
    .eq("id", input.memberId)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath(`/teams/${input.teamId}`);
  return actionOk(toCamel(data) as TeamMember);
}

export async function removeTeamMemberAction(input: {
  teamId: string;
  memberId: string;
}): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  // `.select()` for the same reason as `deleteTeamAction` above.
  const { data: deleted, error } = await ctx.supabase
    .from("team_members")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("team_id", input.teamId)
    .eq("id", input.memberId)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/teams");
  revalidatePath(`/teams/${input.teamId}`);
  return actionOk(undefined);
}
