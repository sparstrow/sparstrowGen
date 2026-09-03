import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { agents } from "../../db/schema.js";
import { config } from "../../config.js";
import { getProvider } from "../../providers/index.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  attachSocket,
  createSession,
  getSession,
  killSession,
  listSessions,
  resizeSession,
} from "../../terminal/manager.js";
import type { Agent } from "@sparstrow/shared";
import { TERMINAL_WS_PATH } from "@sparstrow/shared";

const createBody = z.object({
  agentId: z.string().optional(),
  cols: z.number().int().min(10).max(500).default(220),
  rows: z.number().int().min(5).max(200).default(50),
});

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/terminal/sessions", async () => listSessions());

  app.post("/terminal/sessions", async (request, reply) => {
    const db = getDb();
    const body = createBody.parse(request.body);

    let command = "cmd.exe";
    let args: string[] = [];
    let cwd = config.dataDir;
    let agentId: string | null = null;
    let agentName: string | null = null;

    if (body.agentId) {
      const row = db.select().from(agents).where(eq(agents.id, body.agentId)).get();
      if (!row) throw new HttpError(404, `agent not found: ${body.agentId}`);
      const agent = row as unknown as Agent;
      const provider = getProvider(agent.provider);
      // Interactive terminals are a CLI-provider affordance; direct-API agents
      // have no shell to attach to.
      if (provider.kind !== "cli") {
        throw new HttpError(400, `provider ${agent.provider} has no interactive terminal`);
      }
      const spec = provider.buildInteractiveSpawn(agent, {
        tempDir: config.tmpDir,
        extraEnv: { SPARSTROW_API: `http://${config.host}:${config.port}` },
      });
      command = spec.viaCmdShell
        ? "cmd.exe"
        : spec.command;
      args = spec.viaCmdShell
        ? ["/d", "/s", "/c", spec.command, ...spec.args]
        : spec.args;
      cwd = spec.cwd ?? config.dataDir;
      agentId = agent.id;
      agentName = agent.name;
    }

    const result = createSession({
      command,
      args,
      cwd,
      env: { SPARSTROW_API: `http://${config.host}:${config.port}` },
      cols: body.cols,
      rows: body.rows,
      agentId,
      agentName,
    });
    if (!result.ok) {
      // 429: the caller did nothing wrong, the ceiling is just already full.
      throw new HttpError(429, result.error);
    }
    reply.code(201);
    return result.session;
  });

  app.get("/terminal/sessions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const s = getSession(id);
    if (!s) throw new HttpError(404, `terminal session not found: ${id}`);
    return s;
  });

  app.post("/terminal/sessions/:id/resize", async (request) => {
    const { id } = request.params as { id: string };
    const { cols, rows } = z
      .object({ cols: z.number().int(), rows: z.number().int() })
      .parse(request.body);
    if (!resizeSession(id, cols, rows)) throw new HttpError(404, `terminal session not found: ${id}`);
    return { ok: true };
  });

  app.delete("/terminal/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!killSession(id)) throw new HttpError(404, `terminal session not found: ${id}`);
    reply.code(204);
  });
}

export async function terminalWsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    `${TERMINAL_WS_PATH}/:id`,
    { websocket: true },
    (socket, request) => {
      const { id } = request.params as { id: string };
      const attached = attachSocket(id, socket);
      if (!attached) {
        socket.send("terminal session not found");
        socket.close();
      }
    },
  );
}
