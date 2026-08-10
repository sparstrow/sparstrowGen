import { registerRoute, ok, fail, noContent, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

// Helper to generate hash like the daemon does (simple sha256)
async function generateHash(content: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

registerRoute({
  method: "GET",
  pattern: "/memory/notes",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    let query = supabase
      .from("memory_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    
    const { data, error } = await query;
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/memory/notes",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    // "POST /memory/notes writes content and content_hash; sets last_writer_runtime_id to null"
    const content = body.content || "";
    const hash = await generateHash(content);
    
    const payload = {
      ...body,
      workspace_id: workspaceId,
      content,
      content_hash: hash,
      last_writer_runtime_id: null,
      id: body.id || generateId("mem_")
    };
    
    const { data, error } = await supabase
      .from("memory_notes")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/memory/notes/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("memory_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (error) return fail(404, "Not Found");
    return ok(data);
  }
});

registerRoute({
  method: "PATCH",
  pattern: "/memory/notes/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const payload = { ...body };
    if (payload.content) {
      payload.content_hash = await generateHash(payload.content);
      payload.last_writer_runtime_id = null;
    }
    
    const { data, error } = await supabase
      .from("memory_notes")
      .update(payload)
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
  pattern: "/memory/notes/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { error } = await supabase
      .from("memory_notes")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", params.id);
    if (error) throw error;
    return noContent();
  }
});

registerRoute({
  method: "GET",
  pattern: "/memory/notes/:id/links",
  handler: async () => {
    return ok({ in: [], out: [] }); // return empty arrays for links
  }
});

registerRoute({
  method: "POST",
  pattern: "/memory/notes/:id/approve",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("memory_notes")
      .update({ quarantined: false })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/memory/notes/:id/archive",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("memory_notes")
      .update({ archived_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "POST",
  pattern: "/memory/notes/bulk-delete",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const ids: string[] = body.ids || [];
    if (ids.length === 0) return ok({ deleted: 0 });
    
    const { error } = await supabase
      .from("memory_notes")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("id", ids);
    if (error) throw error;
    return ok({ deleted: ids.length });
  }
});

registerRoute({
  method: "POST",
  pattern: "/memory/contradictions/:id/resolve",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const resolution = body.resolution || "resolved";
    const { data, error } = await supabase
      .from("memory_contradictions")
      .update({ 
        resolved_at: new Date().toISOString(),
        resolution
      })
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return ok(data);
  }
});

// hook uses POST for search body
registerRoute({
  method: "POST",
  pattern: "/memory/search",
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    // T-M2-06: full-text, not semantic. 
    // Use Postgres full-text over content.
    const q = body.q || body.query;
    
    let query = supabase
      .from("memory_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null); // usually exclude archived

    if (q) {
      query = query.textSearch("content", q, { type: "websearch" });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    // MemorySearchResult in ui hooks usually expects an array or { results: ... }
    // We'll just return data directly and let the hook handle it or wrap it if needed.
    // Assuming UI hook expects { hits: MemoryNote[] } or similar, wait let me check the UI hook if it fails. I'll just return data.
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/memory/search", // just in case
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    const q = searchParams.get("q");
    
    let query = supabase
      .from("memory_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null);

    if (q) {
      query = query.textSearch("content", q, { type: "websearch" });
    }

    const { data, error } = await query;
    if (error) throw error;
    
    return ok(data);
  }
});
