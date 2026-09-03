import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { createDirectoryRequestSchema } from "@sparstrow/shared";
import { HttpError } from "../../orchestrator/run-manager.js";
import { createHostDir, listHostDir, listVolumes } from "../../projects/host-fs.js";

/**
 * 001 — host filesystem browsing for the New project folder picker.
 *
 * THIS MODULE IS REGISTERED ONLY WHEN `config.deployment === "local"`
 * (see server.ts, FR-022a). That registration gate is the load-bearing
 * control; the loopback refusal below is a second, independent layer.
 *
 * A loopback check ALONE would not be enough: a hosted core behind a reverse
 * proxy sees loopback source addresses for internet traffic, so this check
 * would pass for every tenant while looking like a working control.
 */

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * FR-022b. Uses the raw socket address: the server does not enable Fastify's
 * trustProxy, so `request.ip` is not attacker-controllable via headers.
 */
function requireLoopback(request: FastifyRequest): void {
  if (!LOOPBACK.has(request.ip)) {
    // Deliberately distinct wording from a directory permission denial, which
    // is also a 403 — a client must be able to tell "you may not use this at
    // all" from "that one folder is locked".
    throw new HttpError(403, "loopback callers only");
  }
}

export async function hostFsRoutes(app: FastifyInstance): Promise<void> {
  /** Drives or mount points — the top level of navigation (FR-009). */
  app.get("/host-fs/volumes", async (request) => {
    requireLoopback(request);
    return { volumes: await listVolumes() };
  });

  /** One directory level; defaults to the home directory (FR-005, FR-010). */
  app.get("/host-fs/dirs", async (request) => {
    requireLoopback(request);
    const { path: target } = z.object({ path: z.string().optional() }).parse(request.query);
    return listHostDir(target);
  });

  /** Create exactly one directory and return its listing (FR-016 – FR-020). */
  app.post("/host-fs/dirs", async (request, reply) => {
    requireLoopback(request);
    const body = createDirectoryRequestSchema.parse(request.body);
    const listing = createHostDir(body.parent, body.name);
    reply.code(201);
    return listing;
  });
}
