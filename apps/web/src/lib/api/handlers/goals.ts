import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

registerRoute({
  method: "GET",
  pattern: "/goals",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

// POST /goals is deliberately NOT implemented here. Creating a goal means
// running the planner, which needs a paired runtime -- it is category C in
// M2/README.md and is registered as a 501 stub in stubs.ts. Inserting a bare
// goals row instead would produce a goal with no plan_nodes and no
// plan_edges, which the goal detail page cannot render and no planner will
// ever pick up. It also used to shadow the stub, since both registered the
// same method+pattern.

registerRoute({
  method: "GET",
  pattern: "/goals/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // GET /goals/:id returns GoalDetail: the goal, its plan_nodes and plan_edges at the current plan_version only, and each node's linked task. Node status is derived from that task.
    const { data: goal, error } = await supabase
      .from("goals")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");

    const planVersion = goal.plan_version;

    let nodes = [];
    let edges = [];

    if (planVersion !== null && planVersion !== undefined) {
      const { data: nodesData, error: nodesErr } = await supabase
        .from("plan_nodes")
        .select("*, tasks(*)")
        .eq("workspace_id", workspaceId)
        .eq("goal_id", params.id)
        .eq("plan_version", planVersion);
      if (nodesErr) throw nodesErr;
      
      const { data: edgesData, error: edgesErr } = await supabase
        .from("plan_edges")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("goal_id", params.id)
        .eq("plan_version", planVersion);
      if (edgesErr) throw edgesErr;

      nodes = nodesData || [];
      edges = edgesData || [];
    }

    return ok({
      ...goal,
      plan_nodes: nodes,
      plan_edges: edges
    });
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/goals/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("goals")
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
  pattern: "/goals/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // .select() makes PostgREST return the deleted rows. Without it a
    // delete that matched nothing -- because the id is unknown OR because
    // RLS hid another workspace's row -- still resolves without error, and
    // this would answer 204. The client then optimistically drops a row it
    // never actually deleted.
    const { data: deleted, error } = await supabase
      .from("goals")
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
  pattern: "/goals/:id/nodes/:nodeId",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("plan_nodes")
      .select("*, tasks(*)")
      .eq("workspace_id", workspaceId)
      .eq("goal_id", params.id)
      .eq("id", params.nodeId)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/goals/:id/nodes/:nodeId",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const { data, error } = await supabase
      .from("plan_nodes")
      .update(body)
      .eq("workspace_id", workspaceId)
      .eq("goal_id", params.id)
      .eq("id", params.nodeId)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});
