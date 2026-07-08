import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { API_BASE } from "@sparstrow/shared";
import { config, repoRoot } from "../config.js";
import { logger } from "../logger.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { agentGatewayRoutes } from "./routes/agent-gateway.js";
import { agentRoutes } from "./routes/agents.js";
import { skillImportRoutes } from "./routes/skill-imports.js";
import { cronRoutes } from "./routes/cron.js";
import { gitRoutes } from "./routes/git.js";
import { goalRoutes } from "./routes/goals.js";
import { memoryRoutes } from "./routes/memory.js";
import { messageRoutes } from "./routes/messages.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { projectRoutes } from "./routes/projects.js";
import { providerRoutes } from "./routes/providers.js";
import { runRoutes } from "./routes/runs.js";
import { systemRoutes } from "./routes/system.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/teams.js";
import { wsRoutes } from "../ws/handler.js";
import { mcpRoutes } from "../mcp/http-mcp.js";
import { terminalRoutes, terminalWsRoutes } from "./routes/terminal.js";
import { graphRoutes } from "./routes/graph.js";
import { requireAuth } from "./auth.js";

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger.child({ mod: "http" }),
    disableRequestLogging: true,
  });

  // The UI is same-origin in prod and vite-proxied in dev, so it never makes a
  // cross-origin call. Disabling CORS kills the cross-origin drive-by that could
  // reach the (formerly) no-auth API and spawn host processes.
  await app.register(cors, { origin: false });
  await app.register(websocket);

  // Tolerate empty JSON bodies and body-less POSTs (rescan/reindex/cancel…).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (typeof body !== "string" || body.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      done(err as Error);
    }
  });
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "validation failed", issues: error.issues });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    const message = error instanceof Error ? error.message : String(error);
    const sqliteCode = (error as { code?: string }).code;
    if (sqliteCode?.startsWith("SQLITE_CONSTRAINT")) {
      return reply.code(409).send({ error: `conflict: ${message}` });
    }
    logger.error({ err: error }, "unhandled API error");
    return reply.code(500).send({ error: "internal server error" });
  });

  // Human/UI surface: every route here can create agents, runs, and terminals
  // that spawn host processes, so it all requires the per-install token.
  await app.register(
    async (api) => {
      api.addHook("onRequest", requireAuth);
      await api.register(systemRoutes);
      await api.register(agentRoutes);
      await api.register(skillImportRoutes);
      await api.register(projectRoutes);
      await api.register(teamRoutes);
      await api.register(runRoutes);
      await api.register(memoryRoutes);
      await api.register(taskRoutes);
      await api.register(goalRoutes);
      await api.register(messageRoutes);
      await api.register(pipelineRoutes);
      await api.register(cronRoutes);
      await api.register(gitRoutes);
      await api.register(providerRoutes);
      await api.register(terminalRoutes);
      await api.register(graphRoutes);
    },
    { prefix: API_BASE },
  );

  // Agent callback gateway: authenticated per-run by the x-sparstrow-run header
  // inside its handlers, so it stays outside the bearer-token scope.
  await app.register(async (api) => api.register(agentGatewayRoutes), { prefix: API_BASE });

  // WebSockets take the token via ?token= (browser, prod) or Authorization
  // (vite dev proxy). The event stream and the terminal pty both require it.
  await app.register(async (scope) => {
    scope.addHook("onRequest", requireAuth);
    await scope.register(wsRoutes);
    await scope.register(terminalWsRoutes);
  });

  await app.register(mcpRoutes);

  // Serve the built UI when present (desktop/prod; dev uses the vite server).
  const uiDist =
    process.env.SPARSTROW_UI_DIST ?? path.join(repoRoot, "packages", "ui", "dist");
  const indexPath = path.join(uiDist, "index.html");
  if (fs.existsSync(indexPath)) {
    // Inject the per-install token so the same-origin UI can authenticate.
    // Same-origin policy keeps any cross-origin page from reading it.
    const injectedIndex = fs
      .readFileSync(indexPath, "utf8")
      .replace(
        "</head>",
        `<script>window.__SPARSTROW_TOKEN__=${JSON.stringify(config.apiToken)};</script></head>`,
      );
    const sendIndex = (reply: import("fastify").FastifyReply) =>
      reply.type("text/html").send(injectedIndex);

    await app.register(fastifyStatic, { root: uiDist, wildcard: false, index: false });
    app.get("/", (_request, reply) => sendIndex(reply));
    // SPA fallback: any unknown GET that isn't an API/WS/MCP path gets index.html.
    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? "/";
      if (
        request.method === "GET" &&
        !url.startsWith(API_BASE) &&
        !url.startsWith("/ws") &&
        !url.startsWith("/mcp")
      ) {
        return sendIndex(reply);
      }
      return reply.code(404).send({ error: "not found" });
    });
    logger.info({ uiDist }, "serving built UI");
  }

  return app;
}
