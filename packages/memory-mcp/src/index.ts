/**
 * sparstrow-memory — stdio MCP server spawned by agent CLIs (claude --mcp-config).
 * A thin authenticated client for the Sparstrowgen core REST API: every call
 * carries the per-run id header so the core can resolve the calling agent and
 * enforce its memory scopes server-side.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.SPARSTROW_API ?? "http://127.0.0.1:48750";
const RUN_ID = process.env.SPARSTROW_RUN_ID ?? "";

async function call(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sparstrow-run": RUN_ID,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  return text;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true,
  };
}

const server = new McpServer({ name: "sparstrow-memory", version: "0.1.0" });

server.tool(
  "memory_search",
  "Search your long-term memory (semantic + keyword, scoped to what you may read). Returns matching notes with excerpts and vault paths.",
  {
    query: z.string().describe("What to look for, in natural language"),
    k: z.number().int().min(1).max(25).optional().describe("Max results (default 8)"),
  },
  async ({ query, k }) => {
    try {
      return textResult(await call("/agent/memory/search", { query, k: k ?? 8 }));
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
  async ({ title, content, scope, tags }) => {
    try {
      return textResult(
        await call("/agent/memory/save", { title, content, scope: scope ?? "agent", tags: tags ?? [] }),
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "task_create",
  "Create a task on the shared task board, optionally assigned to another agent (hand-off). The orchestrator will run the assignee with your task description.",
  {
    title: z.string(),
    description: z.string().describe("Everything the assignee needs to act — they have no other context"),
    assignToAgent: z.string().optional().describe("Agent name or slug to hand the task to"),
    priority: z.number().int().min(0).max(3).optional().describe("0=low 3=urgent (default 1)"),
  },
  async ({ title, description, assignToAgent, priority }) => {
    try {
      return textResult(
        await call("/agent/tasks", { title, description, assignToAgent, priority: priority ?? 1 }),
      );
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "task_update",
  "Update a task you are working on: set its status and/or result summary.",
  {
    taskId: z.string(),
    status: z.enum(["in_progress", "review", "done", "failed"]).optional(),
    result: z.string().optional().describe("Outcome summary for the requester"),
  },
  async ({ taskId, status, result }) => {
    try {
      return textResult(await call(`/agent/tasks/${taskId}/update`, { status, result }));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  "message_send",
  "Send a message to the user's inbox or to another agent. Messages to agents may trigger a run for them.",
  {
    to: z.string().optional().describe("Agent name/slug, or omit for the user's inbox"),
    subject: z.string(),
    body: z.string(),
  },
  async ({ to, subject, body }) => {
    try {
      return textResult(await call("/agent/messages", { to, subject, body }));
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(`sparstrow-memory mcp failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
