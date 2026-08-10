import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  projectCreateSchema,
  projectDirectiveCreateSchema,
  projectDirectiveUpdateSchema,
  projectProvisionSchema,
  projectUpdateSchema,
  slugify,
  type Project,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { projects } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { getProjectGitState } from "../../projects/git-status.js";
import { listSnapshots } from "../../projects/wip-snapshot.js";
import {
  createDirective,
  deleteDirective,
  listDirectives,
  updateDirective,
} from "../../projects/directives.js";
import { provisionProject, runProjectIndex } from "../../projects/provision.js";
import { createClientVariant, syncFromBase } from "../../projects/variants.js";
import { getProjectBriefing, setProjectBriefing } from "../../projects/briefing.js";
import { getProjectDream, setProjectDream } from "../../projects/dream.js";
import { runDreamCycle } from "../../memory/dream-cycle.js";
import { listProjectDir } from "../../projects/files.js";
import { deleteCronJobsForProject, fireJobNow } from "../../scheduler/service.js";
import { enqueueGraphIndex, onProjectDeleted, readGraphProjectStatus } from "../../graph/graph-lifecycle.js";
import { logger } from "../../logger.js";

const nowIso = () => new Date().toISOString();

function rowToProject(row: typeof projects.$inferSelect): Project {
  return { ...row } as unknown as Project;
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", async () => {
    return getDb().select().from(projects).orderBy(projects.name).all().map(rowToProject);
  });

  app.post("/projects", async (request, reply) => {
    const body = projectCreateSchema.parse(request.body);
    const id = `prj_${nanoid(10)}`;
    const ts = nowIso();
    const slug = body.slug ?? slugify(body.name);
    if (!slug) throw new HttpError(400, "project name must contain at least one alphanumeric character");
    getDb()
      .insert(projects)
      .values({ ...body, id, slug, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201);
    return rowToProject(getDb().select().from(projects).where(eq(projects.id, id)).get()!);
  });

  /**
   * P4 §4 provisioning modal: create a project via scratch (mkdir + optional git
   * init), bind (existing folder), or clone (public git URL). Performs the
   * filesystem action, inserts the row, and kicks off a best-effort auto-index.
   */
  app.post("/projects/provision", async (request, reply) => {
    const body = projectProvisionSchema.parse(request.body);
    const project = await provisionProject(body);
    reply.code(201);
    return project;
  });

  app.get("/projects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return rowToProject(row);
  });

  /** P4 §1: read-only git state for the project's rootDir (branch/dirty/commits). */
  app.get("/projects/:id/git", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return getProjectGitState(row.rootDir);
  });

  /**
   * OQ-1: the WIP snapshots taken for this project, newest first. Read-only —
   * restoring is a deliberate git command the developer runs themselves, not a
   * button that overwrites their working tree.
   */
  app.get("/projects/:id/wip-snapshots", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return listSnapshots(row.rootDir);
  });

  /** P4 §4: read-only file tree — one directory level under rootDir (P4-Q4). */
  app.get("/projects/:id/files", async (request) => {
    const { id } = request.params as { id: string };
    const { path: subpath } = z.object({ path: z.string().optional() }).parse(request.query);
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return listProjectDir(row.rootDir, subpath ?? "");
  });

  /**
   * P4 §2 + P5: ONE Reindex action, two passes (locked P5-Q4) — the naive
   * notes indexer run AND the graph index. Manual reindex is the explicit
   * opt-in that lets a sandbox graph-index (#41).
   */
  app.post("/projects/:id/reindex", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    const run = runProjectIndex(id);
    const graph = enqueueGraphIndex(id, { reason: "manual" });
    reply.code(202);
    return {
      started: run !== null,
      runId: run?.id ?? null,
      graph: graph.queued ? "queued" : (graph.reason ?? "skipped"),
    };
  });

  /** P5: per-project graph index status for the Code-graph panel (ws pushes transitions). */
  app.get("/projects/:id/graph", async (request) => {
    const { id } = request.params as { id: string };
    if (!getDb().select().from(projects).where(eq(projects.id, id)).get()) {
      throw new HttpError(404, `project not found: ${id}`);
    }
    return readGraphProjectStatus(id);
  });

  /** P4 §7: fork a client variant — clone the base repo + copy its project notes. */
  app.post("/projects/:id/variants", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ name: z.string().min(1).max(80), rootDir: z.string().min(1) })
      .parse(request.body);
    const variant = await createClientVariant(id, body);
    reply.code(201);
    return variant;
  });

  /** P4 §7: task-based downstream sync — never auto-merges. */
  app.post("/projects/:id/sync-from-base", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ assignedAgentId: z.string().nullable().optional() }).parse(request.body ?? {});
    return syncFromBase(id, { assignedAgentId: body.assignedAgentId ?? null });
  });

  /** P4 §7: the client variants of a base project (for the nested Variants tab). */
  app.get("/projects/:id/variants", async (request) => {
    const { id } = request.params as { id: string };
    return getDb()
      .select()
      .from(projects)
      .where(eq(projects.parentProjectId, id))
      .orderBy(projects.name)
      .all()
      .map(rowToProject);
  });

  app.put("/projects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = projectUpdateSchema.parse(request.body);
    const db = getDb();
    const existing = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new HttpError(404, `project not found: ${id}`);
    db.update(projects)
      .set({ ...body, updatedAt: nowIso() })
      .where(eq(projects.id, id))
      .run();
    return rowToProject(db.select().from(projects).where(eq(projects.id, id)).get()!);
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new HttpError(404, `project not found: ${id}`);
    // No FK cascade on cron_jobs.project_id — unschedule + remove them first so no
    // orphan briefing/cron handle keeps firing against the deleted project.
    deleteCronJobsForProject(id);
    // P5 (#18): stop the engine child + remove the whole per-project store —
    // ghost-free by construction. Best-effort; deletion never blocks on it.
    try {
      await onProjectDeleted(id);
    } catch (err) {
      logger.warn({ err, projectId: id }, "graph store cleanup failed (non-fatal)");
    }
    getDb().delete(projects).where(eq(projects.id, id)).run();
    reply.code(204);
  });

  // ── Morning briefing (§5, opt-in per project — P4-Q1) ──
  app.get("/projects/:id/briefing", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const job = getProjectBriefing(id);
    return { enabled: job?.enabled ?? false, cronExpr: job?.cronExpr ?? null, job };
  });

  app.put("/projects/:id/briefing", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const body = z
      .object({ enabled: z.boolean(), cronExpr: z.string().optional(), timezone: z.string().optional() })
      .parse(request.body);
    const job = setProjectBriefing(id, body);
    return { enabled: job?.enabled ?? false, cronExpr: job?.cronExpr ?? null, job };
  });

  /** Run the briefing now ("brief me"). */
  app.post("/projects/:id/briefing/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const job = getProjectBriefing(id);
    if (!job) throw new HttpError(409, "briefing is not enabled for this project");
    fireJobNow(job.id);
    reply.code(202);
    return { fired: true };
  });

  // ── Dream cycle (P5 item 5, opt-in per project — P5-Q1) ──
  app.get("/projects/:id/dream", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const job = getProjectDream(id);
    return { enabled: job?.enabled ?? false, cronExpr: job?.cronExpr ?? null, job };
  });

  app.put("/projects/:id/dream", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const body = z
      .object({ enabled: z.boolean(), cronExpr: z.string().optional(), timezone: z.string().optional() })
      .parse(request.body);
    const job = setProjectDream(id, body);
    return { enabled: job?.enabled ?? false, cronExpr: job?.cronExpr ?? null, job };
  });

  /** Run tonight's dream cycle now (fire-and-forget; report lands via ws + digest). */
  app.post("/projects/:id/dream/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    void runDreamCycle(id);
    reply.code(202);
    return { fired: true };
  });

  // ── Project directives (§2/P4-Q2): ordered, toggleable, guaranteed-injected ──
  const requireProject = (id: string) => {
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return row;
  };

  app.get("/projects/:id/directives", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    return listDirectives(id);
  });

  app.post("/projects/:id/directives", async (request, reply) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const body = projectDirectiveCreateSchema.parse(request.body);
    reply.code(201);
    return createDirective(id, body);
  });

  app.put("/projects/:id/directives/:directiveId", async (request) => {
    const { id, directiveId } = request.params as { id: string; directiveId: string };
    requireProject(id);
    const body = projectDirectiveUpdateSchema.parse(request.body);
    const updated = updateDirective(id, directiveId, body);
    if (!updated) throw new HttpError(404, `directive not found: ${directiveId}`);
    return updated;
  });

  app.delete("/projects/:id/directives/:directiveId", async (request, reply) => {
    const { id, directiveId } = request.params as { id: string; directiveId: string };
    requireProject(id);
    if (!deleteDirective(id, directiveId)) throw new HttpError(404, `directive not found: ${directiveId}`);
    reply.code(204);
  });
}
