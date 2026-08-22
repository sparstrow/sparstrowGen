import { executionModeForProvider } from "@sparstrow/shared";
import { registerRoute, ok, fail, HandlerContext } from "../router";
import { OPAQUE_COLUMNS } from "../../case";

function generateId(prefix: string) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}`;
}

const CHAT_SESSION_KINDS = ["free", "project", "agent", "agent-creator"];

/**
 * BUG-2026-08-22-chat-new-session-404s: this route never existed, so the
 * empty-chat composer's "Send message" 404'd on the very first message of
 * every new conversation. `packages/core/src/api/routes/chat.ts` (the daemon)
 * has always had the real thing — same validation, same row shape — because
 * `chat_sessions`/`chat_messages` are cloud-canonical (see the pgTable doc
 * comment in packages/shared/src/db/schema.ts): sessions are lightweight
 * metadata rows, not a dispatched run, so creating one needs no paired
 * machine and doesn't belong behind the M5 "needs a runtime" stub next to it
 * in stubs.ts (`POST /chat/sessions/:id/messages`, `.../retry`) — those two
 * stay exactly as legible-501 as before. This mirrors core's
 * `createChatSession` validation so the two implementations don't drift.
 */
registerRoute({
  method: "POST",
  pattern: "/chat/sessions",
  opaqueKeys: OPAQUE_COLUMNS.chat_sessions as string[],
  handler: async ({ supabase, workspaceId, body }: HandlerContext) => {
    const kind = body?.kind;
    if (!CHAT_SESSION_KINDS.includes(kind)) {
      return fail(400, `kind must be one of ${CHAT_SESSION_KINDS.join(", ")}.`);
    }

    let provider: string | null = body.provider ?? null;
    let model: string | null = body.model ?? null;
    let projectId: string | null = null;
    let agentId: string | null = null;

    if (kind === "project") {
      if (!body.project_id || typeof body.project_id !== "string") {
        return fail(400, "projectId is required for a project chat.");
      }
      const { data: project, error } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", body.project_id)
        .maybeSingle();
      if (error) throw error;
      if (!project) return fail(404, `project not found: ${body.project_id}`);
      projectId = project.id;
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    } else if (kind === "agent") {
      if (!body.agent_id || typeof body.agent_id !== "string") {
        return fail(400, "agentId is required for an agent chat.");
      }
      const { data: agent, error } = await supabase
        .from("agents")
        .select("id, provider, model")
        .eq("workspace_id", workspaceId)
        .eq("id", body.agent_id)
        .maybeSingle();
      if (error) throw error;
      if (!agent) return fail(404, `agent not found: ${body.agent_id}`);
      if (executionModeForProvider(agent.provider) !== "cli") {
        return fail(400, `chat supports CLI providers only (got ${agent.provider})`);
      }
      agentId = agent.id;
      projectId = typeof body.project_id === "string" ? body.project_id : null;
      provider = agent.provider;
      model = agent.model;
    } else {
      // free / agent-creator: no binding, defaults only.
      provider = provider ?? "claude-code";
      model = model ?? "sonnet";
    }

    if (provider && executionModeForProvider(provider) !== "cli") {
      return fail(400, `chat supports CLI providers only (got ${provider})`);
    }

    const row = {
      id: generateId("chs_"),
      workspace_id: workspaceId,
      kind,
      title: typeof body.title === "string" ? body.title : "",
      project_id: projectId,
      agent_id: agentId,
      provider,
      model,
      status: "active",
      draft: kind === "agent-creator" ? {} : null,
      last_message_at: null,
    };

    const { data, error } = await supabase.from("chat_sessions").insert(row).select().single();
    if (error) throw error;
    return ok(data, OPAQUE_COLUMNS.chat_sessions as string[]);
  }
});

registerRoute({
  method: "GET",
  pattern: "/chat/sessions",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});

registerRoute({
  method: "GET",
  pattern: "/chat/sessions/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();
    if (sessionErr) return fail(404, "Not Found");

    const { data: messages, error: messagesErr } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("session_id", params.id)
      .order("created_at", { ascending: true });
    if (messagesErr) throw messagesErr;

    return ok({
      ...session,
      messages: messages || []
    });
  }
});
