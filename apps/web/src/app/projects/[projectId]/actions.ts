"use server";

import { revalidatePath } from "next/cache";
import type { Project, ProjectDirective, ProjectDirectiveCreate, ProjectDirectiveUpdate, ProjectUpdate } from "@sparstrow/shared";
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

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Moved verbatim from the `PUT /projects/:id` handler this replaces. */
export async function updateProjectAction(
  id: string,
  data: ProjectUpdate,
): Promise<ActionResult<Project>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = toSnake(data) as Record<string, unknown>;
  delete payload.root_dir;

  const { data: row, error } = await ctx.supabase
    .from("projects")
    .update(payload)
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return actionOk({ ...toCamel(row), rootDir: null } as Project);
}

/**
 * P4 §7: fork a client variant from a base project.
 *
 * There is no pre-existing handler to move here -- `POST /projects/:id/variants`
 * was never registered (only the `GET` list handler exists), so this call site
 * always 404'd before this task. `useProjectVariants`' read queries a
 * `project_variants` table that does not exist anywhere in
 * `packages/shared/src/db/schema.ts` or its migrations; a variant is really a
 * `projects` row with `parentProjectId` set (see `idx_projects_parent`), which
 * is the shape this insert follows. The read stays broken -- reads are out of
 * scope for this task (plan DD-5) -- and is filed as
 * `BUG-2026-08-25-project-variants-read-queries-a-table-that-does-not-exist`.
 *
 * `rootDir` is accepted but not persisted, matching every other project
 * creation path in this file: `rootDir` is not a real column yet (M7).
 */
export async function createVariantAction(input: {
  baseId: string;
  name: string;
  rootDir: string;
}): Promise<ActionResult<Project>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const id = generateId("prj_");
  const baseSlug = slugify(input.name ?? "");
  const attempts = [baseSlug, withCollisionSuffix(baseSlug || "project")];

  for (let i = 0; i < attempts.length; i++) {
    const payload = {
      workspace_id: ctx.workspaceId,
      id,
      name: input.name,
      slug: attempts[i],
      parent_project_id: input.baseId,
    };
    const { data, error } = await ctx.supabase.from("projects").insert(payload).select().single();
    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      return actionErrorFrom(error);
    }
    revalidatePath(`/projects/${input.baseId}`);
    return actionOk({ ...toCamel(data), rootDir: null } as Project);
  }

  // Unreachable: the second attempt's random suffix cannot collide twice.
  return actionFail("Internal Server Error");
}

/** Moved verbatim from the `POST /projects/:id/directives` handler this replaces. */
export async function createDirectiveAction(
  projectId: string,
  data: ProjectDirectiveCreate,
): Promise<ActionResult<ProjectDirective>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const payload = {
    ...toSnake(data),
    workspace_id: ctx.workspaceId,
    project_id: projectId,
    id: generateId("dir_"),
  };
  const { data: row, error } = await ctx.supabase
    .from("project_directives")
    .insert(payload)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath(`/projects/${projectId}`);
  return actionOk(toCamel(row) as ProjectDirective);
}

/** Moved verbatim from the `PUT /projects/:id/directives/:directiveId` handler this replaces. */
export async function updateDirectiveAction(
  projectId: string,
  id: string,
  data: ProjectDirectiveUpdate,
): Promise<ActionResult<ProjectDirective>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const { data: row, error } = await ctx.supabase
    .from("project_directives")
    .update(toSnake(data))
    .eq("workspace_id", ctx.workspaceId)
    .eq("project_id", projectId)
    .eq("id", id)
    .select()
    .single();
  if (error) return actionErrorFrom(error);

  revalidatePath(`/projects/${projectId}`);
  return actionOk(toCamel(row) as ProjectDirective);
}

/** Moved verbatim from the `DELETE /projects/:id/directives/:directiveId` handler this replaces. */
export async function deleteDirectiveAction(
  projectId: string,
  id: string,
): Promise<ActionResult<void>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  // `.select()` makes PostgREST return the deleted rows. Without it a delete
  // that matched nothing -- because the id is unknown OR because RLS hid
  // another workspace's row -- still resolves without error, and this would
  // report success. The caller then optimistically drops a row it never
  // actually deleted.
  const { data: deleted, error } = await ctx.supabase
    .from("project_directives")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("project_id", projectId)
    .eq("id", id)
    .select("id");
  if (error) return actionErrorFrom(error);
  if (!deleted || deleted.length === 0) return actionFail("Not Found");

  revalidatePath(`/projects/${projectId}`);
  return actionOk(undefined);
}
