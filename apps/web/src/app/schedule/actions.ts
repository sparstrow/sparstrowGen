"use server";

import { revalidatePath } from "next/cache";
import type { CronJob, CronTargetType } from "@sparstrow/shared";
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

export interface CronJobCreateInput {
  name: string;
  cronExpr: string;
  timezone?: string;
  targetType: CronTargetType;
  targetId: string;
  prompt: string;
  projectId?: string | null;
  enabled?: boolean;
}

export type CronJobUpdateInput = Partial<CronJobCreateInput>;

/** Moved verbatim from the `POST /cron-jobs` handler this replaces. */
export async function createCronJobAction(
  input: CronJobCreateInput,
): Promise<ActionResult<CronJob>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(input),
    workspace_id: ctx.workspaceId,
    id: generateId("crn_"),
  };
  const { data, error } = await ctx.supabase.from("cron_jobs").insert(payload).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/schedule");
  return actionOk(toCamel(data) as CronJob);
}

/** Moved verbatim from the `PUT /cron-jobs/:id` handler this replaces. */
export async function updateCronJobAction(
  id: string,
  data: CronJobUpdateInput,
): Promise<ActionResult<CronJob>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("cron_jobs")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/schedule");
  return actionOk(toCamel(row) as CronJob);
}

/**
 * Moved verbatim from the `DELETE /cron-jobs/:id` handler this replaces.
 * `.select("id")` makes PostgREST return the deleted rows — without it a
 * delete that matched nothing (unknown id, or RLS hiding another workspace's
 * row) still resolves without error, and the client would optimistically
 * drop a row it never actually deleted.
 */
export async function deleteCronJobAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: deleted, error } = await ctx.supabase
    .from("cron_jobs")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/schedule");
  return actionOk(undefined);
}
