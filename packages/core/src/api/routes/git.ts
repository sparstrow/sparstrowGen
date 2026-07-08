import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { openPrRequestSchema } from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { projects } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  GitOpsError,
  openPullRequest,
  prTargetForProfile,
  pushAgentBranch,
  type ProfileContext,
} from "../../projects/git-ops.js";
import { getPrQueue, getProjectPrs } from "../../projects/pr-queue.js";

function profileContext(row: typeof projects.$inferSelect): ProfileContext {
  return {
    profile: row.executionProfile === "production_app" ? "production_app" : "factory",
    stagingBranch: row.stagingBranch,
  };
}

function requireProject(id: string): typeof projects.$inferSelect {
  const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw new HttpError(404, `project not found: ${id}`);
  return row;
}

/** Map a git-ops failure to a client-meaningful HTTP status. */
function gitOpsHttp(err: unknown): never {
  if (err instanceof GitOpsError) {
    const status = err.code === "no_pat" ? 400 : err.code === "protected_ref" ? 403 : 422;
    throw new HttpError(status, err.message);
  }
  throw err;
}

export async function gitRoutes(app: FastifyInstance): Promise<void> {
  /** P7 §6 — the aggregate PR queue for the Dashboard (all GitHub-remote projects). */
  app.get("/git/pull-requests", async () => getPrQueue());

  /** Per-project PR list (filtered view on project detail). */
  app.get("/projects/:id/pull-requests", async (request) => {
    const { id } = request.params as { id: string };
    const group = await getProjectPrs(id);
    if (!group) throw new HttpError(404, `project not found: ${id}`);
    return group;
  });

  /**
   * Open a PR from an agent branch — graduates FACTORY-LOOP's manual compare-URL
   * step. Base defaults to the profile's PR target (factory → main, production_app
   * → staging). Guard rails + PAT are enforced inside git-ops.
   */
  app.post("/projects/:id/git/pr", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = requireProject(id);
    const body = openPrRequestSchema.parse(request.body);
    const base = body.base ?? prTargetForProfile(profileContext(row));
    try {
      const pr = await openPullRequest({
        remote: row.gitRemote,
        head: body.head,
        base,
        title: body.title,
        body: body.body,
      });
      reply.code(201);
      return pr;
    } catch (err) {
      gitOpsHttp(err);
    }
  });

  /** Push an agent/* branch (core-enforced: protected refs refused). */
  app.post("/projects/:id/git/push", async (request) => {
    const { id } = request.params as { id: string };
    const row = requireProject(id);
    const { branch, remote } = z
      .object({ branch: z.string().min(1), remote: z.string().optional() })
      .parse(request.body);
    try {
      return await pushAgentBranch(row.rootDir, branch, profileContext(row), { remote });
    } catch (err) {
      gitOpsHttp(err);
    }
  });
}
