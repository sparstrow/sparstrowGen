import { registerRoute, ok, fail, HandlerContext } from "../router";

/**
 * M9 — the workspace as something an owner fills in.
 *
 * Before this, `/api/v1` had 16 handler modules and not one of them touched the
 * `workspaces` table: the workspace id was *resolved* per request by
 * `getActiveWorkspaceId` and used as a filter, and the row itself was never
 * read back or written.
 *
 * Singular and id-less, per M9 decision 1. The caller has exactly one active
 * workspace, resolved and authorized server-side before this handler runs. A
 * `/workspaces/:id` shape would invite passing an id the server then has to
 * re-authorize, for a product that has no workspace picker and whose
 * multiple-workspace branch is a deliberate 400 (`D-7`).
 *
 * The write half (`PATCH /workspace`) moved to `app/settings/actions.ts`'s
 * `updateWorkspaceAction` (`T-WA-08`), along with the slug-move logic
 * (`writeWorkspace`). `parseWorkspacePatch` moved out to
 * `lib/patch-validation.ts` for the reason documented there.
 */

/** Every column GET returns. `owner_id` is deliberately absent. */
const SELECT = "id, name, slug, description, context, logo_url, created_at";

export type { WorkspacePatch } from "../../patch-validation";
export { parseWorkspacePatch, BOOTSTRAP_SLUG } from "../../patch-validation";

/**
 * Slug helpers now live in `lib/slug.ts` and are re-exported here so every
 * existing import site and `workspace-routes.test.ts` are unaffected.
 *
 * Moved by `T-WA-01`: this module calls `registerRoute()` at module scope, so
 * a Server Action importing `slugify` from here would pull the whole route
 * registry into the action's module graph as a side effect.
 */
export { slugify, withCollisionSuffix } from "../../slug";

registerRoute({
  method: "GET",
  pattern: "/workspace",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("workspaces")
      .select(SELECT)
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");

    // T-M17-02 — the caller's own role in this workspace, not a property of
    // the workspace row itself (hence a second query rather than a join
    // widening `SELECT` above). `terminals.tsx` needs this to render "not
    // permitted" (FR-009) instead of "unreachable" for a member who is
    // neither owner nor admin — a distinction the Realtime control channel's
    // own subscribe/timeout signals cannot make on their own, since RLS
    // refuses the SUBSCRIBE regardless of whether the machine is online.
    // `ctx.supabase` carries the caller's session, so this reads only their
    // own membership row.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: membership } = user
      ? await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

    return ok({ ...data, role: membership?.role ?? "member" });
  },
});
