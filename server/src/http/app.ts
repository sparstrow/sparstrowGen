import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { createClient } from "@supabase/supabase-js";
import { matchDaemonRoute, type DaemonContext } from "../routes/daemon/index.js";
import {
  fail,
  getActiveWorkspaceId,
  handleError,
  matchRoute,
  parseBody,
  type HandlerContext,
} from "../routes/index";
import { SupabaseAuthProvider, bearerFrom, type AuthProvider } from "../auth/index";
import type { ServerConfig } from "./config";

/**
 * The API every client talks to.
 *
 * Its whole job is to turn an HTTP request into a `HandlerContext` and a
 * `Response` back into an HTTP reply. The 71 routes it serves are the same
 * modules `apps/web`'s adapter serves, unchanged — that is the point of the
 * registry being framework-free, and it is why this file is short.
 *
 * Built as a factory rather than a module-scope singleton so tests can stand
 * one up with a stub `AuthProvider` and no network.
 */

/** How a client says which workspace it is acting in. */
const WORKSPACE_HEADER = "x-sparstrow-workspace";

/**
 * Copy a `Response` onto a Fastify reply.
 *
 * `Response.body` is a web `ReadableStream`, which Fastify's `send` accepts
 * directly in Node 18+; buffering it first would break streaming responses the
 * moment one is added. A 204 has no body at all and must not be given one.
 */
async function sendResponse(reply: FastifyReply, res: Response): Promise<void> {
  reply.status(res.status);
  res.headers.forEach((value, key) => {
    // Fastify sets these itself from the payload; copying them across produces
    // a mismatched length or a double-encoded body.
    if (key === "content-length" || key === "transfer-encoding") return;
    reply.header(key, value);
  });

  if (res.status === 204 || !res.body) {
    await reply.send();
    return;
  }

  await reply.send(Buffer.from(await res.arrayBuffer()));
}

export type BuildOptions = {
  config: ServerConfig;
  /** Injectable so tests need neither Supabase nor a network. */
  auth?: AuthProvider;
};

export async function buildServer({ config, auth }: BuildOptions): Promise<FastifyInstance> {
  const authProvider =
    auth ??
    new SupabaseAuthProvider(config.supabaseUrl, config.supabaseAnonKey, {
      serviceRoleKey: config.supabaseServiceRoleKey,
      jwtSecret: config.supabaseJwtSecret,
    });

  const app = Fastify({
    // Silent under vitest: a request log line per assertion buries the actual
    // test output, and these tests assert on the response, never on the log.
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : { level: process.env.SPARSTROW_LOG_LEVEL ?? "info" },
    bodyLimit: 8 * 1024 * 1024,
  });

  /**
   * Accept an empty body on a JSON content type.
   *
   * Fastify's default parser rejects `""` with `FST_ERR_CTP_EMPTY_JSON_BODY`
   * **before any route runs**, so a `DELETE` sent with
   * `Content-Type: application/json` and no body 400s with a Fastify error the
   * caller cannot act on — and the route it was aimed at never executes.
   *
   * Found by running it: a `DELETE /chat/sessions/:id` from the desktop app
   * returned 400 and the session was still there afterwards. Worth noting that
   * this file previously *claimed* to handle it in a comment while doing
   * nothing of the sort — the comment described an intention, and a comment
   * that describes an intention as a behaviour is worse than no comment, since
   * it stops the next reader from checking.
   *
   * `null` rather than `{}` so a handler can still tell "no body" from "an
   * empty object", which `parseBody` and the registry both cope with.
   */
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body: string, done) => {
      if (!body || !body.trim()) return done(null, null);
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ["authorization", "content-type", WORKSPACE_HEADER],
  });

  /**
   * Liveness. Deliberately unauthenticated and deliberately says nothing about
   * the database — a health check that fails when Supabase is slow tells a
   * supervisor to restart a process that is fine.
   */
  app.get("/healthz", async () => ({ ok: true, service: "sparstrow-server" }));

  /**
   * The daemon protocol.
   *
   * Separate from `/api/v1/*` above and authenticated completely differently:
   * that surface takes a user JWT and lets RLS be the backstop, this one takes
   * a machine's bearer token and uses the service role, for which there is no
   * backstop at all. Two mount points rather than one router with a mode flag,
   * so the two credential models can never be confused for one another.
   *
   * Absent a service-role key this is not mounted. That is not a degraded mode
   * to paper over — `server/` genuinely cannot resolve a machine token without
   * it, and a 404 saying so is better than a 500 on every heartbeat.
   */
  if (config.supabaseServiceRoleKey) {
    const serviceDb = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const daemonCtx: DaemonContext = { db: serviceDb, webOrigin: config.webOrigin };

    app.all("/api/daemon/*", async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const url = new URL(req.url, `http://${config.host}:${config.port}`);
        const path = url.pathname.replace(/^\/api\/daemon/, "") || "/";
        const handler = matchDaemonRoute(req.method, path);
        if (!handler) return sendResponse(reply, fail(404, "Not Found"));

        // Rebuilt as a web `Request` because that is what these handlers took
        // when they lived in Next, and keeping the signature is what made the
        // move a move. Body is re-serialised rather than streamed: every daemon
        // route reads JSON, and a stream would have to be buffered anyway.
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body:
            req.method === "GET" || req.method === "HEAD" || req.body == null
              ? undefined
              : JSON.stringify(req.body),
        });

        return sendResponse(reply, await handler(request, daemonCtx));
      } catch (err) {
        return sendResponse(reply, handleError(err));
      }
    });
  } else {
    app.log.warn(
      "SUPABASE_SERVICE_ROLE_KEY is not set — /api/daemon is not served, so no machine can pair with this server.",
    );
  }

  app.all("/api/v1/*", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await authProvider.verify(bearerFrom(req.headers.authorization));
      if (!result.ok) {
        return sendResponse(reply, fail(401, "not authenticated"));
      }

      const supabase = authProvider.clientFor(result.credential);

      const url = new URL(req.url, `http://${config.host}:${config.port}`);
      const searchParams = url.searchParams;

      const remembered = req.headers[WORKSPACE_HEADER];
      const rememberedWorkspaceId = typeof remembered === "string" ? remembered : null;

      const ws = await getActiveWorkspaceId(supabase, searchParams, rememberedWorkspaceId);
      if (ws.error || !ws.workspaceId) {
        return sendResponse(
          reply,
          Response.json(ws, { status: ws.status || 400 }),
        );
      }

      const path = url.pathname.replace(/^\/api\/v1/, "") || "/";
      const match = matchRoute(req.method, path);
      if (!match) {
        return sendResponse(reply, fail(404, "Not Found"));
      }

      let body = null;
      if (["POST", "PUT", "PATCH"].includes(req.method) && req.body != null) {
        body = parseBody(req.body, match.route.opaqueKeys);
      }

      const ctx: HandlerContext = {
        supabase,
        workspaceId: ws.workspaceId,
        params: match.params,
        searchParams,
        body,
      };

      return sendResponse(reply, await match.route.handler(ctx));
    } catch (err) {
      return sendResponse(reply, handleError(err));
    }
  });

  return app;
}
