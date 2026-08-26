import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

registerRoute({
  method: "GET",
  pattern: "/skills",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/skills",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const payload = {
      ...body,
      workspace_id: workspaceId,
      id: body.id || generateId("skl_")
    };
    const { data, error } = await supabase
      .from("skills")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
      .select("*, files:skill_files(*)")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/skills/:id", // hooks.ts says PUT /skills/:id
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
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
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("skills")
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
  pattern: "/skills/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("skills")
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
  pattern: "/skills/assignments",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("agent_skills")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "PUT",
  pattern: "/skills/assignments",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    // Expected body: { assignments: { agentId, skillId }[] }
    //
    // T-M2-04 calls for a set operation "inside one request", and the delete
    // and insert genuinely must be one transaction: as two PostgREST calls, an
    // insert that fails after the delete committed wipes every assignment in
    // the workspace. PostgREST cannot span statements, so this goes through an
    // RPC (policies/006_agent_skill_assignments_rpc.sql). It is SECURITY
    // INVOKER, so RLS still applies to both halves.
    const assignments = (body.assignments || []).map((a: any) => ({
      agent_id: a.agent_id || a.agentId,
      skill_id: a.skill_id || a.skillId,
    }));

    if (assignments.some((a: any) => !a.agent_id || !a.skill_id)) {
      return fail(400, "each assignment requires agentId and skillId");
    }

    const { data, error } = await supabase.rpc("set_agent_skill_assignments", {
      p_workspace_id: workspaceId,
      p_assignments: assignments,
    });
    if (error) throw error;
    return ok(data ?? []);
  }
});
