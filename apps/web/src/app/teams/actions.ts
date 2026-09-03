"use server";

import { revalidatePath } from "next/cache";
import type { Team } from "@sparstrow/shared";
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
import { slugifyShort, withCollisionSuffix } from "@sparstrow/shared";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * T-WA-01 -- the phase's worked example of the Server Action pattern
 * `apps/web/CLAUDE.md` mandates for every write.
 *
 * `teams` is first in the conversion because `T-VR-05` already moved its READ
 * to a Server Component, so it is the one page where converting the write
 * completes the picture: action -> `revalidatePath` -> server re-render, one
 * round trip, no React Query invalidation bridge at all. Every other page in
 * band 22 lands in the intermediate state plan DD-1 describes, so if the
 * worked example were one of those, seven tasks would be copying a
 * half-pattern.
 *
 * Plan: doc/plans/2026-08-24-server-action-write-conversion.md
 */

export async function createTeamAction(input: {
  name: string;
  description?: string;
}): Promise<ActionResult<Team>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const id = generateId("tem_");

  // `teams.slug` is `not null unique` per workspace with no DB default. Unlike
  // an UPDATE there is no existing value to fall back to, so omitting it is a
  // constraint violation, not degraded service
  // (BUG-2026-08-22-team-create-500-missing-slug). One retry with a random
  // suffix on collision -- moved here verbatim from the handler this replaces
  // rather than re-derived, because re-deriving it is how the identical bug
  // reappeared on POST /projects/provision
  // (BUG-2026-08-24-project-provision-always-400s).
  const baseSlug = slugifyShort(input.name ?? "");
  const attempts = [baseSlug, withCollisionSuffix(baseSlug || "team")];

  for (let i = 0; i < attempts.length; i++) {
    const payload = {
      ...toSnake({ name: input.name, description: input.description ?? "" }),
      workspace_id: ctx.workspaceId,
      id,
      slug: attempts[i],
    };
    const { data, error } = await ctx.supabase
      .from("teams")
      .insert(payload)
      .select()
      .single();
    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      return actionErrorFrom(error);
    }
    revalidatePath("/teams");
    return actionOk(toCamel(data) as Team);
  }

  // Unreachable: the second attempt's random suffix cannot collide twice.
  return actionFail("Internal Server Error");
}

/**
 * Replaces a team's whole project set.
 *
 * Deliberately a SEPARATE action from `createTeamAction`, not folded into it.
 * The create dialog's existing behaviour is that a team whose project
 * assignment fails is still created, and the dialog closes and refreshes
 * anyway rather than stranding an invisible team. One server-side transaction
 * would roll the team back instead -- a behaviour change, which the plan's
 * Scope boundaries make a defect rather than an improvement.
 */
export async function setTeamProjectsAction(input: {
  teamId: string;
  projectIds: string[];
}): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { error: delError } = await ctx.supabase
    .from("team_projects")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("team_id", input.teamId);
  if (delError) return actionErrorFrom(delError);

  if (input.projectIds.length > 0) {
    const inserts = input.projectIds.map((id) => ({
      workspace_id: ctx.workspaceId,
      team_id: input.teamId,
      project_id: id,
    }));
    const { error: insError } = await ctx.supabase.from("team_projects").insert(inserts);
    if (insError) return actionErrorFrom(insError);
  }

  // Both paths: `/teams/<id>` renders the project list, and `/teams` renders a
  // project COUNT on the card. Revalidating only the detail route leaves the
  // list showing a stale number -- the failure that looks like nothing until
  // someone notices the count is wrong.
  revalidatePath("/teams");
  revalidatePath(`/teams/${input.teamId}`);
  return actionOk(undefined);
}
