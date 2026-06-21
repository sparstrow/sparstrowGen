import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { logger } from "../logger.js";
import {
  agentMemorySave,
  agentMemorySearch,
  resolveRunContext,
  type RunContext,
} from "../memory/agent-memory.js";
import { HttpError } from "../orchestrator/run-manager.js";

/**
 * Streamable-HTTP MCP endpoint served by the core itself at POST /mcp.
 * Stateless: a fresh server+transport per request, with the calling run's
 * context resolved from the x-sparstrow-run header claude sends per spawn.
 * (stdio MCP servers never connect in claude's headless mode on Windows —
 * HTTP transport is the reliable path, and avoids per-run child processes.)
 */

type ToolExtras = Record<string, unknown>;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  const message =
    err instanceof HttpError || err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export type AgentToolRegistrar = (server: McpServer, ctx: RunContext) => void;

/** Phase 3+ modules append extra tool registrars (tasks, messages). */
export const extraToolRegistrars: AgentToolRegistrar[] = [];

function buildServerForRun(ctx: RunContext): McpServer {
  const server = new McpServer({ name: "sparstrow-memory", version: "0.1.0" });

  server.tool(
    "memory_search",
    "Search your long-term memory (semantic + keyword, scoped to what you may read). Returns matching notes with excerpts and vault paths.",
    {
      query: z.string().describe("What to look for, in natural language"),
      k: z.number().int().min(1).max(25).optional().describe("Max results (default 8)"),
    },
    async ({ query, k }: { query: string; k?: number }, _extra: ToolExtras) => {
      try {
        const hits = await agentMemorySearch(ctx, query, k ?? 8);
        return textResult(JSON.stringify(hits, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "memory_save",
    "Save a durable memory note (markdown) into your allowed scope. Use for facts, decisions, and knowledge worth remembering across runs. One topic per note.",
    {
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("Markdown body of the note"),
      scope: z
        .enum(["global", "project", "agent"])
        .optional()
        .describe("Where to store it: agent (private, default), project (current project), global"),
      tags: z.array(z.string()).optional().describe("Topic tags"),
    },
    async (
      args: { title: string; content: string; scope?: "global" | "project" | "agent"; tags?: string[] },
      _extra: ToolExtras,
    ) => {
      try {
        const note = agentMemorySave(ctx, {
          title: args.title,
          content: args.content,
          scope: args.scope ?? "agent",
          tags: args.tags ?? [],
        });
        return textResult(JSON.stringify({ saved: true, path: note.path, id: note.id }, null, 2));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  for (const register of extraToolRegistrars) register(server, ctx);
  return server;
}

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  app.post("/mcp", async (request, reply) => {
    let ctx: RunContext;
    try {
      ctx = resolveRunContext(request.headers["x-sparstrow-run"]);
    } catch (err) {
      const status = err instanceof HttpError ? err.statusCode : 401;
      return reply.code(status).send({
        jsonrpc: "2.0",
        error: { code: -32000, message: err instanceof Error ? err.message : "unauthorized" },
        id: null,
      });
    }

    const server = buildServerForRun(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      request.raw.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      logger.error({ err }, "mcp request failed");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "internal error" },
            id: null,
          }),
        );
      }
    }
  });

  // Stateless server: no SSE stream, no sessions.
  app.get("/mcp", async (_request, reply) => reply.code(405).send());
  app.delete("/mcp", async (_request, reply) => reply.code(405).send());
}
