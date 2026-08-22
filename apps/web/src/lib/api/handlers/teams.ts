import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { slugify, withCollisionSuffix } from "./workspace";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

registerRoute({
  method: "GET",
  pattern: "/teams",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/teams",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const id = body.id || generateId("tem_");
    // `teams.slug` is `not null unique` per workspace, with no DB default —
    // unlike an UPDATE (workspace.ts), this is an INSERT, so there is no
    // existing value to fall back to if a slug is left out; omitting it
    // isn't degraded service, it's a constraint violation and a 500
    // (BUG-2026-08-22-team-create-500-missing-slug). One retry with a random
    // suffix on collision, same pattern as the workspace slug.
    const baseSlug = typeof body.slug === "string" && body.slug.trim() ? body.slug : slugify(body.name ?? "");
    const attempts = [baseSlug, withCollisionSuffix(baseSlug || "team")];

    for (let i = 0; i < attempts.length; i++) {
      const payload = {
        ...body,
        workspace_id: workspaceId,
        id,
        slug: attempts[i],
      };
      const { data, error } = await supabase.from("teams").insert(payload).select().single();
      if (error) {
        if (error.code === "23505" && i < attempts.length - 1) continue;
        throw error;
      }
      return ok(data);
    }

    // Unreachable: the second attempt's random suffix cannot collide twice.
    return fail(500, "Internal Server Error");
  }
});

registerRoute({
  method: "GET",
  pattern: "/teams/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/teams/:id", // hooks.ts uses PUT instead of PATCH often
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("teams")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/teams/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("teams")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/teams/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("teams")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select("id");
    if (error) throw error;
    if (!deleted || deleted.length === 0) return fail(404, "Not Found");
    return noContent();
  }
});

registerRoute({
  method: "GET",
  pattern: "/teams/:id/members",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_members")
      .select("*, agents(*)") // assuming team_members joins agents
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/teams/:id/members",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      team_id: params.id,
      id: body.id || generateId("tmb_")
    };
    const { data, error } = await supabase
      .from("team_members")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/teams/:id/members/:memberId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_members")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id)
      .eq("id", params.memberId)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/teams/:id/members/:memberId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_members")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id)
      .eq("id", params.memberId)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/teams/:id/members/:memberId",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("team_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id)
      .eq("id", params.memberId)
      .select("id");
    if (error) throw error;
    if (!deleted || deleted.length === 0) return fail(404, "Not Found");
    return noContent();
  }
});

registerRoute({
  method: "GET",
  pattern: "/teams/:id/projects",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("team_projects")
      .select("*, projects(*)")
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/teams/:id/projects",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    // Expected { projectIds: string[] }
    const projectIds: string[] = body.projectIds || body.project_ids || [];
    const { error: delError } = await supabase
      .from("team_projects")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("team_id", params.id);
    if (delError) throw delError;

    if (projectIds.length > 0) {
      const inserts = projectIds.map(id => ({
        workspace_id: workspaceId,
        team_id: params.id,
        project_id: id
      }));
      const { error: insError } = await supabase
        .from("team_projects")
        .insert(inserts);
      if (insError) throw insError;
    }
    
    return ok({ success: true });
  }
});
