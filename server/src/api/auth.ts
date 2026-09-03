import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

/**
 * Pull the per-install token from a request. Browsers can't set headers on a
 * WebSocket, so `/ws` connections pass it as `?token=`; HTTP clients use the
 * Authorization header (or x-sparstrow-token, which the vite dev proxy adds).
 */
export function extractToken(req: FastifyRequest): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-sparstrow-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const q = (req.query as { token?: unknown } | undefined)?.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

export function tokenValid(token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(config.apiToken);
  // Length check first: timingSafeEqual throws on length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * onRequest hook for the human/UI surface (/api + /ws). These routes can create
 * agents, runs, and terminals that spawn host processes, so an unauthenticated
 * caller here is remote code execution. The agent callback gateway (/mcp,
 * /agent/*) is NOT behind this — it authenticates per-run via x-sparstrow-run.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!tokenValid(extractToken(req))) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}
