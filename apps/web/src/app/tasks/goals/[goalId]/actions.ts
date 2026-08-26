"use server";

import { revalidatePath } from "next/cache";
import type { Goal } from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";
import { runTaskAction } from "@web/app/tasks/actions";

/**
 * `POST /goals/:id/cancel` (what `useCancelGoal` called) never existed, but
 * the generic `PATCH /goals/:id` handler this replaces does, and a goal
 * cancel is exactly what it already does for any field: `goals.status` has a
 * real `"cancelled"` value the schema and this page's own UI (`GOAL_BADGE`,
 * the `!["done","cancelled"].includes(...)` gate) already treat as a settled
 * terminal state. No new behavior invented — see `usePauseGoal`/
 * `useResumeGoal`/`useReplanGoal`, which stay on the same generic mechanism
 * and are untouched by this task.
 */
export async function cancelGoalAction(id: string): Promise<ActionResult<Goal>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("goals")
    .update({ status: "cancelled" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/tasks");
  revalidatePath(`/tasks/goals/${id}`);
  return actionOk(toCamel(data) as Goal);
}

/**
 * `POST /goals/:id/nodes/:nodeId/retry` never existed either. A plan node has
 * no status of its own — `packages/shared/src/db/schema.ts`'s `planNodes`
 * table has none; the goal detail page derives a node's status entirely from
 * its linked `tasks` row. So "retry this step" resolves to "respawn the
 * assignee on the node's linked task" — exactly what `runTaskAction`
 * (`POST /tasks/:id/run`'s real, working replacement) already does. Reusing
 * it here rather than re-deriving the `start_run` RPC call and its
 * park-status fallback is deliberate: that logic is already real and already
 * proven, and retrying a node has no behavior a plain task run doesn't cover.
 */
export async function retryNodeAction(goalId: string, nodeId: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: node, error } = await ctx.supabase
    .from("plan_nodes")
    .select("task_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("goal_id", goalId)
    .eq("id", nodeId)
    .single();
  if (error) return actionErrorFrom(error);
  if (!node?.task_id) return actionFail("This step has no linked task to retry.");

  const result = await runTaskAction(node.task_id);
  if (!result.ok) return result;

  revalidatePath("/tasks");
  revalidatePath(`/tasks/goals/${goalId}`);
  return actionOk(undefined);
}
