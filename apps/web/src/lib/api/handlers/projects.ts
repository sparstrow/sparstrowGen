import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

registerRoute({
  method: "GET",
  pattern: "/projects",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    
    // Add compatibility for rootDir until M7
    const mapped = data.map((d: any) => ({ ...d, rootDir: null, root_dir: null }));
    return ok(mapped);
  }
});

registerRoute({
  method: "POST",
  pattern: "/projects",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("prj_")
    };
    // rootDir is deprecated and not in schema
    delete payload.rootDir;
    delete payload.root_dir;

    const { data, error } = await supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    
    const mapped = { ...data, rootDir: null, root_dir: null };
    return ok(mapped);
  }
});

registerRoute({
  method: "GET",
  pattern: "/projects/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    
    const mapped = { ...data, rootDir: null, root_dir: null };
    return ok(mapped);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/projects/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const payload = { ...body };
    delete payload.rootDir;
    delete payload.root_dir;
    
    const { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    
    const mapped = { ...data, rootDir: null, root_dir: null };
    return ok(mapped);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/projects/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const payload = { ...body };
    delete payload.rootDir;
    delete payload.root_dir;

    const { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    
    const mapped = { ...data, rootDir: null, root_dir: null };
    return ok(mapped);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/projects/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("projects")
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
  method: "POST",
  pattern: "/projects/provision",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    // Just creates a project row
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("prj_")
    };
    delete payload.rootDir;
    delete payload.root_dir;

    const { data, error } = await supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    
    const mapped = { ...data, rootDir: null, root_dir: null };
    return ok(mapped);
  }
});

registerRoute({
  method: "GET",
  pattern: "/projects/:id/variants",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("project_variants")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("project_id", params.id);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/projects/:id/directives",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("project_directives")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("project_id", params.id);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/projects/:id/directives",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      project_id: params.id,
      id: body.id || generateId("dir_")
    };
    const { data, error } = await supabase
      .from("project_directives")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/projects/:id/directives/:directiveId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("project_directives")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("project_id", params.id)
      .eq("id", params.directiveId)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/projects/:id/directives/:directiveId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("project_directives")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("project_id", params.id)
      .eq("id", params.directiveId)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "DELETE",
  pattern: "/projects/:id/directives/:directiveId",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("project_directives")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("project_id", params.id)
      .eq("id", params.directiveId)
      .select("id");
    if (error) throw error;
    if (!deleted || deleted.length === 0) return fail(404, "Not Found");
    return noContent();
  }
});
