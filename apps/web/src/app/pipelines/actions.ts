"use server";

import { revalidatePath } from "next/cache";
import type { Pipeline } from "@sparstrow/shared";
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

export interface PipelineStepInput {
  agentId: string;
  promptTemplate: string;
  onFailure: "abort" | "continue";
  position: number;
}

export interface PipelineCreateInput {
  name: string;
  description?: string;
  steps: PipelineStepInput[];
  projectId?: string | null;
  teamId?: string | null;
  enabled?: boolean;
}

export type PipelineUpdateInput = Partial<PipelineCreateInput>;

/** Moved verbatim from the `POST /pipelines` handler this replaces. */
export async function createPipelineAction(
  input: PipelineCreateInput,
): Promise<ActionResult<Pipeline>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(input),
    workspace_id: ctx.workspaceId,
    id: generateId("ppl_"),
  };
  const { data, error } = await ctx.supabase.from("pipelines").insert(payload).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/pipelines");
  return actionOk(toCamel(data) as Pipeline);
}

/** Moved verbatim from the `PUT /pipelines/:id` handler this replaces. */
export async function updatePipelineAction(
  id: string,
  data: PipelineUpdateInput,
): Promise<ActionResult<Pipeline>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("pipelines")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/pipelines");
  return actionOk(toCamel(row) as Pipeline);
}

/**
 * Moved verbatim from the `DELETE /pipelines/:id` handler this replaces.
 * `.select("id")` makes PostgREST return the deleted rows — without it a
 * delete that matched nothing still resolves without error, and the client
 * would optimistically drop a row it never actually deleted.
 */
export async function deletePipelineAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: deleted, error } = await ctx.supabase
    .from("pipelines")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/pipelines");
  return actionOk(undefined);
}
