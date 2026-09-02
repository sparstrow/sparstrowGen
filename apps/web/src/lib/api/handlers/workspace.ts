import { registerRoute, ok, fail, HandlerContext } from "../router";

/**
 * M9 — the workspace as something an owner fills in.
 *
 * Before this, `/api/v1` had 16 handler modules and not one of them touched the
 * `workspaces` table: the workspace id was *resolved* per request by
 * `getActiveWorkspaceId` and used as a filter, and the row itself was never
 * read back or written.
 *
 * Singular and id-less, per M9 decision 1. The caller has exactly one ACTIVE
 * workspace, resolved and authorized server-side before this handler runs. A
 * `/workspaces/:id` shape would invite passing an id the server then has to
 * re-authorize.
 *
 * That reasoning survived the arrival of a real switcher (2026-09-02),
 * unchanged: `GET /workspaces` below lists what someone may switch TO, and
 * switching is a Server Action that writes a validated cookie — neither of
 * them takes an id from a caller and trusts it. The old deliberate 400 on
 * multiple memberships is gone; see `lib/workspace.ts`.
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

/**
 * Every workspace the caller belongs to — what the switcher renders.
 *
 * Read through `workspace_members` rather than `workspaces` directly, and
 * filtered on the caller's own user id. RLS on `workspaces` scopes reads to
 * workspaces you are a member of, but RLS on `workspace_members` deliberately
 * also exposes your CO-MEMBERS' rows (seeing who else is in your workspace is
 * the point), so without this filter a two-person workspace would list the
 * same workspace once per member. That is the identical trap
 * `getActiveWorkspaceId` documents, and it is worth restating because it
 * produced a real lockout bug the first time it was missed.
 */
registerRoute({
  method: "GET",
  pattern: "/workspaces",
  handler: async ({ supabase }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "Unauthorized");

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces(id, name, slug)")
      .eq("user_id", user.id);
    if (error) throw error;

    const rows = (data ?? [])
      .map((row) => {
        const ws = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
        return ws ? { ...ws, role: row.role as string } : null;
      })
      .filter((row): row is { id: string; name: string; slug: string; role: string } => row !== null)
      // Named workspaces first, then by name. A fresh account's workspace has
      // `name: ""` (T-M9-01), and sorting it to the bottom keeps the unnamed
      // one from leading a list it says nothing useful about.
      .sort((a, b) => (a.name || "￿").localeCompare(b.name || "￿"));

    return ok(rows);
  },
});
