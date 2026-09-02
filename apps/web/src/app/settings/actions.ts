"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Workspace } from "@web/api/hooks";
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
import { parseProfilePatch, parseWorkspacePatch, BOOTSTRAP_SLUG } from "@web/lib/patch-validation";
import { slugify, withCollisionSuffix } from "@web/lib/slug";
import { WORKSPACE_COOKIE } from "@web/lib/workspace";

const PROFILE_SELECT = "id, email, name, avatar_url, bio";
const WORKSPACE_SELECT = "id, name, slug, description, context, logo_url, created_at";

export type UpdateProfileInput = Partial<Pick<Profile, "name" | "bio" | "avatarUrl">>;
export type UpdateWorkspaceInput = Partial<
  Pick<Workspace, "name" | "description" | "context" | "logoUrl">
>;

/**
 * Moved verbatim from the `PATCH /me` handler this replaces. Two stores, not
 * one — `bio` never reaches auth metadata (plan decision 9), and `name`
 * writes both `full_name` and `name` there so a future `bootstrap_workspace`
 * finds the chosen name rather than falling through to `''`. Auth first,
 * then the row: a failing row update after a successful auth update is a
 * visible error the owner can retry; the reverse would show the old value
 * with no error at all.
 */
export async function updateProfileAction(
  data: UpdateProfileInput,
): Promise<ActionResult<Profile>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const parsed = parseProfilePatch(toSnake(data));
  if ("error" in parsed) return actionFail(parsed.error);
  const { patch } = parsed;

  if (Object.keys(patch).length === 0) {
    return actionFail("Nothing to update. Editable fields are name, bio, avatarUrl.");
  }

  const metadata: Record<string, string | null> = {};
  if ("name" in patch) {
    metadata.full_name = patch.name;
    metadata.name = patch.name;
  }
  if ("avatar_url" in patch) metadata.avatar_url = patch.avatar_url;

  if (Object.keys(metadata).length > 0) {
    const { error: authError } = await ctx.supabase.auth.updateUser({ data: metadata });
    if (authError) return actionErrorFrom(authError);
  }

  const { data: row, error } = await ctx.supabase
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select(PROFILE_SELECT)
    .maybeSingle();
  if (error) return actionErrorFrom(error);
  if (!row) return actionFail("Not Found");

  revalidatePath("/settings");
  return actionOk(toCamel(row) as Profile);
}

/**
 * Write the patch, moving the slug with it if a slug was derived. Moved
 * verbatim from `handlers/workspace.ts`'s `writeWorkspace`.
 */
async function writeWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  patch: Record<string, string | null>,
  slug: string | undefined,
): Promise<ActionResult<Workspace>> {
  const attempts: Array<Record<string, string | null>> =
    slug === undefined
      ? [patch]
      : [{ ...patch, slug }, { ...patch, slug: withCollisionSuffix(slug) }, patch];

  for (let i = 0; i < attempts.length; i++) {
    const { data, error } = await supabase
      .from("workspaces")
      .update(attempts[i])
      .eq("id", workspaceId)
      .select(WORKSPACE_SELECT)
      .maybeSingle();

    if (error) {
      if (error.code === "23505" && i < attempts.length - 1) continue;
      return actionErrorFrom(error);
    }

    if (!data) return actionFail("Not Found");
    return actionOk(toCamel(data) as Workspace);
  }

  // Unreachable: the last attempt carries no slug, so it cannot raise 23505.
  return actionFail("Internal Server Error");
}

/**
 * Moved verbatim from the `PATCH /workspace` handler this replaces, including
 * the once-in-a-lifetime slug move (plan decision 8, FR-022): the slug
 * derives from the workspace's first real name while it still carries the
 * bootstrap-generated one, then freezes forever.
 */
export async function updateWorkspaceAction(
  data: UpdateWorkspaceInput,
): Promise<ActionResult<Workspace>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const parsed = parseWorkspacePatch(toSnake(data));
  if ("error" in parsed) return actionFail(parsed.error);
  const { patch } = parsed;

  if (Object.keys(patch).length === 0) {
    return actionFail(
      "Nothing to update. Editable fields are name, description, context, logoUrl.",
    );
  }

  let slug: string | undefined;
  if (typeof patch.name === "string" && patch.name !== "") {
    const { data: current, error: readError } = await ctx.supabase
      .from("workspaces")
      .select("slug")
      .eq("id", ctx.workspaceId)
      .maybeSingle();
    if (readError) return actionErrorFrom(readError);
    if (!current) return actionFail("Not Found");

    if (BOOTSTRAP_SLUG.test(current.slug as string)) {
      const derived = slugify(patch.name);
      if (derived) slug = derived;
    }
  }

  const result = await writeWorkspace(ctx.supabase, ctx.workspaceId, patch, slug);
  if (result.ok) revalidatePath("/settings");
  return result;
}

/**
 * US3 — switch which of the owner's workspaces they are looking at.
 *
 * The choice is a cookie rather than a route segment. Putting the workspace in
 * the URL (`/w/<id>/machines`) is the better long-term shape and rewrites every
 * link, route and redirect in the app — disproportionate inside a change whose
 * subject is machines. Noted in the plan's Decisions as a future refactor
 * rather than smuggled in here.
 *
 * Membership is verified before the cookie is written. RLS would deny the
 * queries anyway, but a page rendering half-empty because the cookie names a
 * workspace they left is a worse answer than refusing the switch outright.
 */
export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<ActionResult<{ workspaceId: string }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const { data: membership, error } = await ctx.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return actionErrorFrom(error);
  if (!membership) return actionFail("You are not a member of that workspace.", "not_a_member");

  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A year. This is a preference, not a credential — it names a workspace the
    // reader is checked against on every request, so a stale one is harmless.
    maxAge: 60 * 60 * 24 * 365,
  });

  // Everything is workspace-scoped, so there is no narrower invalidation that
  // would be correct here.
  revalidatePath("/", "layout");
  return actionOk({ workspaceId });
}
