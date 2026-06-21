import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { API_BASE } from "@sparstrow/shared";
import { repoRoot } from "../config.js";
import { logger } from "../logger.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { agentGatewayRoutes } from "./routes/agent-gateway.js";
import { agentRoutes } from "./routes/agents.js";
import { cronRoutes } from "./routes/cron.js";
import { memoryRoutes } from "./routes/memory.js";
import { messageRoutes } from "./routes/messages.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { projectRoutes } from "./routes/projects.js";
import { runRoutes } from "./routes/runs.js";
import { systemRoutes } from "./routes/system.js";
import { taskRoutes } from "./routes/tasks.js";
import { wsRoutes } from "../ws/handler.js";
import { mcpRoutes } from "../mcp/http-mcp.js";
import { terminalRoutes, terminalWsRoutes } from "./routes/terminal.js";

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger.child({ mod: "http" }),
    disableRequestLogging: true,
  });

  await app.register(cors, { origin: true });
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

  await app.register(
    async (api) => {
      await api.register(systemRoutes);
      await api.register(agentRoutes);
      await api.register(projectRoutes);
      await api.register(runRoutes);
      await api.register(memoryRoutes);
      await api.register(agentGatewayRoutes);
      await api.register(taskRoutes);
      await api.register(messageRoutes);
      await api.register(pipelineRoutes);
      await api.register(cronRoutes);
      await api.register(terminalRoutes);
    },
    { prefix: API_BASE },
  );

  await app.register(wsRoutes);
  await app.register(terminalWsRoutes);
  await app.register(mcpRoutes);

  // Serve the built UI when present (desktop/prod; dev uses the vite server).
  const uiDist =
    process.env.SPARSTROW_UI_DIST ?? path.join(repoRoot, "packages", "ui", "dist");
  if (fs.existsSync(path.join(uiDist, "index.html"))) {
    await app.register(fastifyStatic, { root: uiDist, wildcard: false });
    // SPA fallback: any unknown GET that isn't an API/WS/MCP path gets index.html.
    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? "/";
      if (
        request.method === "GET" &&
        !url.startsWith(API_BASE) &&
        !url.startsWith("/ws") &&
        !url.startsWith("/mcp")
      ) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
    logger.info({ uiDist }, "serving built UI");
  }

  return app;
}
