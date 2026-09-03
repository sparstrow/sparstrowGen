"use server";

import { revalidatePath } from "next/cache";
import type { Run } from "@sparstrow/shared";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  toCamel,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";
import { enqueueFailureFrom } from "@sparstrow/shared";

const RUNS_OPAQUE = ["injected_memory", "effective_tools"];

export interface CreateRunInput {
  agentId: string;
  projectId?: string | null;
  prompt: string;
}

/**
 * Moved verbatim from the `POST /runs` handler this replaces. `start_run`
 * does the real work — choosing an online, capable, project-bound runtime,
 * and creating the run row and its dispatch command in one transaction —
 * this only translates its error contract into `ActionResult`, same as
 * `runTaskAction` in `app/tasks/actions.ts`.
 */
export async function createRunAction(input: CreateRunInput): Promise<ActionResult<Run>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  if (!input.agentId || typeof input.agentId !== "string") {
    return actionFail("agentId is required.", "agent_not_found");
  }
  if (!input.prompt || typeof input.prompt !== "string" || !input.prompt.trim()) {
    return actionFail("A prompt is required to start a run.", "agent_not_found");
  }

  // No workspace id is passed. `start_run` resolves it from the agent, having
  // first checked the caller belongs to that workspace — the same shape as
  // every RLS policy in 001.
  const { data, error } = await ctx.supabase.rpc("start_run", {
    p_agent_id: input.agentId,
    p_prompt: input.prompt,
    p_project_id: input.projectId ?? null,
    p_task_id: null,
    p_target_runtime_id: null,
    p_trigger: "manual",
    p_trigger_ref: null,
    p_lane: "foreground",
  });

  if (error) {
    const failure = enqueueFailureFrom(error);
    // Rethrow anything unrecognised. A connection failure dressed up as a
    // tidy 409 would send the user to check their machines over a bug here.
    if (!failure) return actionErrorFrom(error);
    return actionFail(failure.message, failure.reason);
  }

  revalidatePath("/runs");
  return actionOk(toCamel(data, RUNS_OPAQUE) as Run);
}

/**
 * Moved verbatim from the `POST /runs/:id/cancel` handler this replaces.
 *
 * Cancelling a run that has already finished is NOT an error: the button was
 * correct when the page rendered, and a race with completion is ordinary. The
 * RPC returns the run unchanged and enqueues nothing, so this still returns
 * ok.
 */
export async function cancelRunAction(id: string): Promise<ActionResult<Run>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase.rpc("cancel_run", { p_run_id: id });

  if (error) {
    const failure = enqueueFailureFrom(error);
    if (!failure) return actionErrorFrom(error);
    return actionFail(failure.message, failure.reason);
  }

  revalidatePath("/runs");
  revalidatePath(`/runs/${id}`);
  return actionOk(toCamel(data, RUNS_OPAQUE) as Run);
}
