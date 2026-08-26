"use server";

import { revalidatePath } from "next/cache";
import type { Project, ProjectProvision } from "@sparstrow/shared";
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

/**
 * T-WA-02 -- moved verbatim from the `POST /projects/provision` handler this
 * replaces. `projects` is identity only (see the doc comment on the `projects`
 * pgTable) -- there is no paired-machine dispatch here to act on
 * `mode`/`gitInit`/`gitUrl`/`rootDir` yet, so none of them are real columns.
 * `BUG-2026-08-24-project-provision-always-400s`: this handler used to spread
 * them straight into the insert, which PostgREST rejected outright, and
 * `projects.slug` is `NOT NULL` with no DB default (same shape as
 * `BUG-2026-08-22-team-create-500-missing-slug`) -- this route never got that
 * fix either. Re-deriving either fix is how the identical bug already
 * happened twice on two sibling handlers.
 */
export async function provisionProjectAction(
  input: ProjectProvision,
): Promise<ActionResult<Project>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const id = generateId("prj_");
  const body = toSnake(input) as Record<string, unknown>;
  const baseSlug =
    typeof body.slug === "string" && (body.slug as string).trim()
      ? (body.slug as string)
      : slugify(input.name ?? "");
  const attempts = [baseSlug, withCollisionSuffix(baseSlug || "project")];

  for (let i = 0; i < attempts.length; i++) {
    const payload: Record<string, unknown> = {
      ...body,
      workspace_id: ctx.workspaceId,
      id,
      slug: attempts[i],
    };
    delete payload.mode;
    delete payload.root_dir;
    delete payload.git_url;
    delete payload.git_init;

    const { data, error } = await ctx.supabase.from("projects").insert(payload).select().single();
    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      return actionErrorFrom(error);
    }
    revalidatePath("/projects");
    return actionOk({ ...toCamel(data), rootDir: null } as Project);
  }

  // Unreachable: the second attempt's random suffix cannot collide twice.
  return actionFail("Internal Server Error");
}
