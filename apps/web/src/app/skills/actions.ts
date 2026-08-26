"use server";

import { revalidatePath } from "next/cache";
import type { Skill, SkillCreate, SkillUpdate } from "@sparstrow/shared";
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

/** Moved verbatim from the `POST /skills` handler this replaces. */
export async function createSkillAction(input: SkillCreate): Promise<ActionResult<Skill>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(input),
    workspace_id: ctx.workspaceId,
    id: generateId("skl_"),
  };
  const { data, error } = await ctx.supabase.from("skills").insert(payload).select().single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/skills");
  return actionOk(toCamel(data) as Skill);
}

/** Moved verbatim from the `PUT /skills/:id` handler this replaces. */
export async function updateSkillAction(
  id: string,
  data: SkillUpdate,
): Promise<ActionResult<Skill>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("skills")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath("/skills");
  revalidatePath(`/skills/${id}`);
  return actionOk(toCamel(row) as Skill);
}

/**
 * Moved verbatim from the `DELETE /skills/:id` handler this replaces.
 *
 * `revalidatePath("/skills")` runs here, before this returns -- the detail
 * page's caller navigates to `/skills` only after receiving an `ok: true`
 * result, so the list is already invalidated by the time that navigation
 * lands. Do not wrap this in a way that could call `redirect()` here instead:
 * a Server Action's `try/catch` swallows `redirect()`'s control-flow
 * exception, and the navigation would silently never happen.
 */
export async function deleteSkillAction(id: string): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  // `.select()` makes PostgREST return the deleted rows. Without it a delete
  // that matched nothing -- because the id is unknown OR because RLS hid
  // another workspace's row -- still resolves without error, and this would
  // report success. The caller then optimistically drops a row it never
  // actually deleted.
  const { data: deleted, error } = await ctx.supabase
    .from("skills")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath("/skills");
  revalidatePath(`/skills/${id}`);
  return actionOk(undefined);
}
